// ============================================================================
// Gitvize — GitHub API Service
// ============================================================================

import { sectionError, sectionWithData, sectionData } from "@/lib/section-result";
import { unstable_cache } from "next/cache";
import { createBranchHistory, historyCommits, mergeHistoryPage, HISTORY_PAGE_SIZE, MAX_HISTORY_PAGES } from "@/lib/branch-history";
import { gitShaSchema, parseRepositorySnapshot, repositorySnapshotKey, RepositorySnapshotError } from "@/lib/repository-snapshot";
import { FILE_BATCH_CONCURRENCY, MAX_FILE_BYTES, readBoundedText, ResponseTooLargeError } from "@/lib/response-limits";
import type {
    SectionResult, SectionError, RepositorySections, DependencyFile,
    RepoMetadata,
    RepositorySnapshot,
    RepositoryObservations,
    FileTreeResponse,
    TreeItem,
    Contributor,
    Branch,
    Commit,
    BranchHistory,
    CommitHistoryPage,
    HistoryPageResult,
    MergedPR,
    LanguageStats,
} from "@/types";

const GITHUB_API = "https://api.github.com";

// Token pool — supports GITHUB_TOKENS (comma-separated) for higher throughput
let tokenPoolCursor = 0;
function getNextServerToken(): string | undefined {
    const pool = [
        ...(process.env.GITHUB_TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean),
        ...(process.env.GITHUB_TOKEN ? [process.env.GITHUB_TOKEN.trim()] : []),
    ];
    if (pool.length === 0) return undefined;
    const tok = pool[tokenPoolCursor % pool.length];
    tokenPoolCursor = (tokenPoolCursor + 1) % pool.length;
    return tok;
}

type FetchCacheMode =
    | { revalidate: number }
    | { noStore: true };

function headers(token?: string | null): HeadersInit {
    const h: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
    };
    const normalizedToken = token?.trim();
    if (normalizedToken) {
        h.Authorization = `token ${normalizedToken}`;
    }
    return h;
}

export class GitHubApiError extends Error {
    constructor(public readonly status: number, path: string, body: string) {
        super(`GitHub API error ${status} for ${path}: ${body}`);
        try { this.responseMessage = JSON.parse(body).message; } catch { /* Non-JSON failures are not empty-repository evidence. */ }
    }
    readonly responseMessage?: string;
}

async function ghFetchResponse<T>(
    path: string,
    token?: string | null,
    cacheMode: FetchCacheMode = { revalidate: 300 },
    signal?: AbortSignal,
    redirect: RequestRedirect = "follow",
): Promise<{ data: T; headers: Headers }> {
    signal?.throwIfAborted();
    const url = `${GITHUB_API}${path}`;
    const fetchInit =
        token?.trim() || "noStore" in cacheMode
            ? {
                headers: headers(token),
                cache: "no-store" as const,
            }
            : {
                headers: headers(token),
                next: { revalidate: cacheMode.revalidate },
            };

    const res = await fetch(url, { ...fetchInit, signal, redirect });
    signal?.throwIfAborted();

    if (!res.ok) {
        if (res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) throw new GitHubRateLimitError(retryDelay(res));
        const body = await readBoundedText(res, 64 * 1024).catch(() => "");
        signal?.throwIfAborted();
        throw new GitHubApiError(res.status, path, body);
    }

    const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "9999", 10);
    const limit = parseInt(res.headers.get("x-ratelimit-limit") ?? "5000", 10);
    if (remaining < limit * 0.2) {
        console.warn(`[github] Rate limit low: ${remaining}/${limit} remaining for ${path}`);
    }

    const text = await readBoundedText(res, 8 * 1024 * 1024);
    signal?.throwIfAborted();
    return { data: JSON.parse(text) as T, headers: res.headers };
}

async function ghFetch<T>(path: string, token?: string | null, cacheMode: FetchCacheMode = { revalidate: 300 }, signal?: AbortSignal): Promise<T> {
    return (await ghFetchResponse<T>(path, token, cacheMode, signal)).data;
}

// --- Repository Metadata ---

export async function fetchRepoMetadata(
    owner: string,
    repo: string,
    token?: string | null,
    cacheMode: FetchCacheMode = { revalidate: 300 }
): Promise<RepoMetadata> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any>(`/repos/${owner}/${repo}`, token, cacheMode);
    return {
        owner,
        repo,
        visibility: data.private === true ? "private" : data.private === false ? "public" : undefined,
        fullName: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        forks: data.forks_count,
        watchers: data.subscribers_count,
        openIssues: data.open_issues_count,
        license: data.license?.spdx_id ?? null,
        topics: data.topics ?? [],
        language: data.language,
        pushedAt: data.pushed_at,
        defaultBranch: data.default_branch,
        htmlUrl: data.html_url,
    };
}

// --- File Tree ---

export async function fetchFileTree(
    owner: string,
    repo: string,
    treeRef?: string,
    token?: string | null,
    cacheMode: FetchCacheMode = { revalidate: 120 },
    signal?: AbortSignal,
): Promise<FileTreeResponse> {
    const ref = treeRef ?? "HEAD";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any>(
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        token,
        cacheMode,
        signal,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allItems: TreeItem[] = data.tree.map((item: any) => ({
        path: item.path,
        mode: item.mode,
        type: item.type,
        sha: item.sha,
        size: item.size,
        url: item.url,
    }));

    // Cap at 5,000 items to keep SSE payload manageable for very large repos.
    // The file-tree-graph has its own 2,000-node cap; this just prevents a
    // 46,000-item Linux-scale tree from producing a 9MB SSE done event.
    const MAX_TREE_ITEMS = 5000;
    const truncated = data.truncated || allItems.length > MAX_TREE_ITEMS;
    const tree = allItems.length > MAX_TREE_ITEMS
        ? allItems.slice(0, MAX_TREE_ITEMS)
        : allItems;

    const enumeratedFiles = allItems.filter(item => item.type === "blob").length;
    const coverage = {
        upstreamTruncated: Boolean(data.truncated), applicationCapped: allItems.length > MAX_TREE_ITEMS,
        enumeratedTreeItems: allItems.length, enumeratedFiles,
        retainedTreeItems: tree.length, retainedFiles: tree.filter(item => item.type === "blob").length,
        totalTreeItems: data.truncated ? null : allItems.length, totalFiles: data.truncated ? null : enumeratedFiles,
    };
    return { sha: data.sha, tree, truncated, coverage };
}

// --- README ---

export async function fetchReadme(context: RepositoryReadContext, snapshot: RepositorySnapshot, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const access = snapshotAccess(context, snapshot);
    if (snapshot.status === "empty") return "";
    await verifySnapshotCommit(access, snapshot, signal);
    try {
        return await readContent(access, `/repos/${access.owner}/${access.repo}/readme?ref=${snapshot.commitSha}`, signal);
    } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof GitHubApiError && error.status === 404) {
            await verifySnapshotCommit(access, snapshot, signal);
            return "";
        }
        throw error;
    }
}

// --- Contributors ---

export async function fetchContributors(
    owner: string,
    repo: string,
    token?: string | null
): Promise<{ data: Contributor[]; truncated: boolean; errors: SectionError[] }> {
    const hasToken = !!(token?.trim() || process.env.GITHUB_TOKEN?.trim());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page1 = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/contributors?per_page=100&page=1`,
        token
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapItem = (c: any): Contributor => ({
        login: c.login,
        id: c.id,
        avatarUrl: c.avatar_url,
        contributions: c.contributions,
        htmlUrl: c.html_url,
    });
    const all: Contributor[] = page1.map(mapItem);
    const errors: SectionError[] = [];

    // With a token, paginate up to 500 total (5 pages of 100)
    if (hasToken && page1.length === 100) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extraPages = await Promise.allSettled<any[]>(
            [2, 3, 4, 5].map((p) =>
                ghFetch<any[]>(
                    `/repos/${owner}/${repo}/contributors?per_page=100&page=${p}`,
                    token
                )
            )
        );
        for (const result of extraPages) {
            if (result.status === "rejected") errors.push(githubSectionError(result.reason, "Contributor page"));
            else all.push(...result.value.map(mapItem));
        }
    }

    const truncated = hasToken ? all.length === 500 || errors.length > 0 : page1.length === 100;
    if (truncated) errors.push({ code: "limited", message: `Contributor sample: ${all.length} loaded; additional contributors may be unavailable.` });
    return { data: all, truncated, errors };
}

// --- Branches ---

export async function fetchBranches(
    owner: string,
    repo: string,
    defaultBranch: string,
    token?: string | null
): Promise<Branch[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/branches?per_page=20`,
        token
    );
    const capturedAt = new Date().toISOString();
    return data.map((b) => ({
        name: b.name,
        headSha: gitShaSchema.parse(b.commit.sha),
        capturedAt,
        sha: b.commit.sha,
        isDefault: b.name === defaultBranch,
    }));
}

// --- Commits ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiCommit(c: any): Commit {
    return {
        sha: c.sha,
        shortSha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        authorName: c.commit.author.name,
        authorLogin: c.author?.login ?? null,
        authorAvatar: c.author?.avatar_url ?? null,
        date: c.commit.author.date,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parents: (c.parents ?? []).map((p: { sha: string }) => p.sha),
    };
}

export async function fetchCommits(
    owner: string,
    repo: string,
    branch?: string,
    token?: string | null
): Promise<Commit[]> {
    // Fetch up to 5 pages (500 commits) in parallel for a richer DAG
    const base = branch ? `?sha=${encodeURIComponent(branch)}&per_page=100` : `?per_page=100`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = await Promise.allSettled<any[]>(
        [1, 2, 3, 4, 5].map((page) =>
            ghFetch<any[]>(
                `/repos/${owner}/${repo}/commits${base}&page=${page}`,
                token,
                { revalidate: 120 }
            )
        )
    );

    const failedPage = pages.find((page) => page.status === "rejected");
    if (failedPage?.status === "rejected") throw failedPage.reason;

    const seen = new Set<string>();
    const all: Commit[] = [];

    for (const result of pages) {
        if (result.status !== "fulfilled") continue;
        for (const c of result.value) {
            if (seen.has(c.sha)) continue;
            seen.add(c.sha);
            all.push(mapApiCommit(c));
        }
    }

    return all.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

async function fetchCommitsForDAG(context: RepositoryReadContext, snapshot: RepositorySnapshot, branches: Branch[]) {
    let defaultHistory = createBranchHistory(snapshot.defaultBranch, snapshot.commitSha);
    const branchHistories: Record<string, BranchHistory> = {};
    if (snapshot.status === "empty") return { graphCommits: [] as Commit[], commits: [] as Commit[], defaultHistory, branchHistories, commitsFetchError: false };
    const readPage = async (headSha: string, page: number): Promise<HistoryPageResult> => {
        try { return await fetchHistoryPage(context, headSha, page, HISTORY_PAGE_SIZE); }
        catch (error) { return { status: "error", page, perPage: HISTORY_PAGE_SIZE, error: historyError(error) }; }
    };
    const pages = await Promise.all([1, 2, 3, 4, 5].map(page => readPage(snapshot.commitSha, page)));
    for (const page of pages) defaultHistory = mergeHistoryPage(defaultHistory, page);
    const seen = new Set(historyCommits(defaultHistory).map(commit => commit.sha));
    const missing = branches.filter(branch => branch.name !== snapshot.defaultBranch && !seen.has(branch.headSha ?? branch.sha)).slice(0, 5);
    for (const branch of branches) if (branch.name !== snapshot.defaultBranch) {
        const head = branch.headSha ?? branch.sha;
        branchHistories[branch.name] = createBranchHistory(branch.name, head, head === snapshot.commitSha ? defaultHistory.pages : {});
    }
    await Promise.all(missing.map(async branch => {
        branchHistories[branch.name] = mergeHistoryPage(branchHistories[branch.name], await readPage(branch.headSha ?? branch.sha, 1));
    }));
    const all = [defaultHistory, ...Object.values(branchHistories)].flatMap(historyCommits);
    const graphCommits = [...new Map(all.map(commit => [commit.sha, commit])).values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const commitsFetchError = [defaultHistory, ...Object.values(branchHistories)].some(history => Object.values(history.pages).some(page => page.status === "error"));
    // Legacy aggregate readers still receive the graph union; lists use only branch histories.
    return { graphCommits, commits: graphCommits, defaultHistory, branchHistories, commitsFetchError };
}

// --- Merged Pull Requests ---

export async function fetchMergedPRs(
    owner: string,
    repo: string,
    page: number = 1,
    token?: string | null
): Promise<MergedPR[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=${page}`,
        token
    );

    return data
        .filter((pr) => pr.merged_at !== null)
        .map((pr) => ({
            number: pr.number,
            title: pr.title,
            headBranch: pr.head.ref,
            baseBranch: pr.base.ref,
            mergedAt: pr.merged_at,
            authorLogin: pr.user?.login ?? "unknown",
            authorAvatar: pr.user?.avatar_url ?? null,
            mergedByLogin: pr.merged_by?.login ?? null,
            mergedByAvatar: pr.merged_by?.avatar_url ?? null,
            htmlUrl: pr.html_url,
        }));
}

// --- Languages ---

export async function fetchLanguages(
    owner: string,
    repo: string,
    token?: string | null
): Promise<LanguageStats> {
    return ghFetch<LanguageStats>(`/repos/${owner}/${repo}/languages`, token);
}

// --- Lightweight Access Check ---

export class GitHubRateLimitError extends Error {
    constructor(public readonly retryAfter?: number) {
        super(`GitHub API rate limit reached. ${retryAfter !== undefined
            ? `Try again after ${new Date(Date.now() + retryAfter * 1000).toUTCString()}.`
            : "Please wait and try again."}`);
    }
}

async function inspectRepoAccess(
    owner: string,
    repo: string,
    token?: string | null,
    signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; isPrivate: boolean; fullName?: string; rateLimited?: boolean; retryAfter?: number; token?: string; repositoryId?: number }> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;

    const callerToken = token?.trim();
    let requestToken = callerToken || getNextServerToken();
    signal?.throwIfAborted();
    let res = await fetch(url, {
        headers: headers(requestToken),
        cache: "no-store", signal,
    });
    signal?.throwIfAborted();

    // If a stored token is invalid/expired, retry without auth so public
    // repositories can still be resolved.
    if ((res.status === 401 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") !== "0" && !res.headers.has("retry-after"))) && requestToken) {
        requestToken = undefined;
        res = await fetch(url, {
            headers: headers(null),
            cache: "no-store", signal,
        });
        signal?.throwIfAborted();
    }

    if (!res.ok) {
        const rateLimited = res.status === 429 || (res.status === 403 && (
            res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")
        ));
        const delay = Number(res.headers.get("retry-after") ?? NaN);
        const resetAt = Number(res.headers.get("x-ratelimit-reset") ?? NaN);
        const retryAfter = Number.isFinite(delay) && delay >= 0
            ? Math.max(1, Math.ceil(delay))
            : Number.isFinite(resetAt) && resetAt > 0
                ? Math.max(1, Math.ceil(resetAt - Date.now() / 1000))
                : undefined;
        return {
            ok: false,
            status: res.status,
            isPrivate: false,
            rateLimited,
            retryAfter: rateLimited ? retryAfter : undefined,
        };
    }

    const data = JSON.parse(await readBoundedText(res, 8 * 1024 * 1024)) as { private?: boolean; full_name?: string; id?: number };
    signal?.throwIfAborted();
    if (typeof data.private !== "boolean") return { ok: false, status: 502, isPrivate: false };
    if (data.private && (!callerToken || requestToken !== callerToken)) {
        return { ok: false, status: 404, isPrivate: false };
    }
    return {
        ok: true,
        status: 200,
        isPrivate: Boolean(data.private),
        fullName: data.full_name,
        token: requestToken,
        repositoryId: Number.isSafeInteger(data.id) && data.id! > 0 ? data.id : undefined,
    };
}

export async function checkRepoAccess(owner: string, repo: string, token?: string | null, signal?: AbortSignal) {
    const access = await inspectRepoAccess(owner, repo, token, signal);
    return { ok: access.ok, status: access.status, isPrivate: access.isPrivate, fullName: access.fullName, rateLimited: access.rateLimited, retryAfter: access.retryAfter };
}

function retryDelay(response: Response): number | undefined {
    const delay = Number(response.headers.get("retry-after") ?? NaN);
    const reset = Number(response.headers.get("x-ratelimit-reset") ?? NaN);
    return Number.isFinite(delay) && delay >= 0 ? Math.max(1, Math.ceil(delay)) : Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : undefined;
}

declare const authorizedRead: unique symbol;
export type RepositoryReadContext = { readonly [authorizedRead]: true };
type ReadAccess = { repositoryId?: number; owner: string; repo: string; visibility: "public" | "private"; token?: string; files: Map<string, Promise<string>>; commits: Map<string, Promise<void>>; activeReads: number; waitingReads: Array<() => void> };
// Opaque request-local handles cannot be reconstructed from browser JSON or serialized credentials.
const readContexts = new WeakMap<RepositoryReadContext, ReadAccess>();

export async function authorizeRepositoryRead(owner: string, repo: string, callerToken?: string | null, signal?: AbortSignal): Promise<RepositoryReadContext> {
    if (typeof window !== "undefined") throw new Error("Repository read contexts are server-only");
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner) || !/^[a-zA-Z0-9._-]{1,100}$/.test(repo)) throw new RepositorySnapshotError();
    const access = await inspectRepoAccess(owner, repo, callerToken, signal);
    if (!access.ok) {
        if (access.rateLimited) throw new GitHubRateLimitError(access.retryAfter);
        throw new GitHubApiError(access.status, `/repos/${owner}/${repo}`, "Repository unavailable");
    }
    const context = Object.freeze({}) as RepositoryReadContext;
    readContexts.set(context, { owner, repo, repositoryId: access.repositoryId, visibility: access.isPrivate ? "private" : "public", token: access.token, files: new Map(), commits: new Map(), activeReads: 0, waitingReads: [] });
    return context;
}

function snapshotAccess(context: RepositoryReadContext, value: RepositorySnapshot): ReadAccess {
    const access = readContexts.get(context);
    if (!access) throw new RepositorySnapshotError();
    const snapshot = parseRepositorySnapshot(value, access.owner, access.repo);
    if (snapshot.visibility !== access.visibility) throw new RepositorySnapshotError();
    return access;
}

async function verifySnapshotCommit(access: ReadAccess, snapshot: RepositorySnapshot, signal?: AbortSignal): Promise<void> {
    if (snapshot.status !== "ready") throw new RepositorySnapshotError();
    const key = `${snapshot.commitSha}:${snapshot.treeSha}`;
    let pending = access.commits.get(key);
    if (!pending) {
        pending = ghFetch<{ sha: string; tree: { sha: string } }>(`/repos/${access.owner}/${access.repo}/git/commits/${snapshot.commitSha}`, access.token, { noStore: true }, signal).then(commit => {
            if (commit.sha !== snapshot.commitSha || commit.tree.sha !== snapshot.treeSha) throw new RepositorySnapshotError();
        });
        access.commits.set(key, pending);
    }
    await pending;
    signal?.throwIfAborted();
}

// --- Dependency Files ---

const MANIFEST_FILES = [
    "package.json",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "pyproject.toml",
];

export async function fetchDependencyFiles(context: RepositoryReadContext, snapshot: RepositorySnapshot, signal?: AbortSignal, inventory?: Promise<FileTreeResponse | null>): Promise<{ files: DependencyFile[]; fetchError: string | null; section: SectionResult<DependencyFile[]> }> {
    signal?.throwIfAborted();
    const access = snapshotAccess(context, snapshot);
    if (snapshot.status === "empty") return { files: [], fetchError: null, section: { status: "ready", data: [] } };
    const files: { filename: string; content: string }[] = [];
    const errors: SectionError[] = [];
    let treePromise = inventory;
    for (let offset = 0; offset < MANIFEST_FILES.length; offset += FILE_BATCH_CONCURRENCY) {
        signal?.throwIfAborted();
        const results = await Promise.allSettled(MANIFEST_FILES.slice(offset, offset + FILE_BATCH_CONCURRENCY).map(async filename => ({ filename, content: await readFileAtSnapshot(context, snapshot, filename, signal) })));
        signal?.throwIfAborted();
        for (const [index, result] of results.entries()) {
            if (result.status === "fulfilled") files.push(result.value);
            else if (result.reason !== null && typeof result.reason === "object" && "name" in result.reason && result.reason.name === "AbortError") throw result.reason;
            else if (result.reason instanceof GitHubApiError && result.reason.status === 404) {
                try {
                    await verifySnapshotCommit(access, snapshot, signal);
                    treePromise ??= fetchFileTree(access.owner, access.repo, snapshot.treeSha, access.token, { noStore: true }, signal);
                    const tree = await treePromise;
                    signal?.throwIfAborted();
                    if (!tree || tree.sha !== snapshot.treeSha) throw new RepositorySnapshotError();
                    // A content 404 alone is not evidence of absence or continuing Contents access.
                    if (tree.truncated || tree.tree.some(item => item.path === MANIFEST_FILES[offset + index])) errors.push(githubSectionError(result.reason, "Dependency manifest"));
                } catch (error) { signal?.throwIfAborted(); errors.push(githubSectionError(error, "Dependency manifest")); }
            } else errors.push(githubSectionError(result.reason, "Dependency manifest"));
        }
    }
    return { files, fetchError: errors.length ? "Some pinned dependency manifests could not be loaded." : null, section: sectionWithData(files, errors, files.length > 0) };
}

// --- Paginated commits (used by branch-graph "load more") ---

export class HistoryRequestError extends Error {
    constructor(message = "Invalid pinned history pagination.", public readonly status = 400) { super(message); }
}

function historyError(error: unknown) {
    const status = error instanceof GitHubApiError || error instanceof HistoryRequestError ? error.status : error instanceof GitHubRateLimitError ? 429 : 502;
    return { status, message: error instanceof GitHubRateLimitError ? error.message : `Could not load captured history page (HTTP ${status}). Try again.`, ...(error instanceof GitHubRateLimitError && error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}) };
}

function validateHistoryRequest(headSha: string, page: number, perPage: number) {
    if (!gitShaSchema.safeParse(headSha).success || !Number.isInteger(page) || page < 1 || page > MAX_HISTORY_PAGES || !Number.isInteger(perPage) || perPage < 1 || perPage > HISTORY_PAGE_SIZE) throw new HistoryRequestError();
}

function historyContinuation(link: string | null, access: ReadAccess, headSha: string, page: number, perPage: number, count: number): number | null {
    if (!link) return count === perPage ? page + 1 : null;
    let next: URL | undefined;
    for (const part of link.split(/,\s*(?=<)/)) {
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
        if (!match) throw new HistoryRequestError("GitHub returned invalid history continuation.", 502);
        if (!match[2].split(" ").includes("next")) continue;
        if (next) throw new HistoryRequestError("GitHub returned duplicate history continuation.", 502);
        try { next = new URL(match[1]); } catch { throw new HistoryRequestError("GitHub returned invalid history continuation.", 502); }
    }
    if (!next) return null;
    const namedPath = `/repos/${access.owner}/${access.repo}/commits`.toLowerCase();
    const knownIdPath = access.repositoryId ? `/repositories/${access.repositoryId}/commits` : null;
    const query = next.searchParams;
    if (next.origin !== GITHUB_API || next.username || next.password || next.hash || (next.pathname.toLowerCase() !== namedPath && next.pathname !== knownIdPath) || [...query.keys()].some(key => !["sha", "page", "per_page"].includes(key)) || ["sha", "page", "per_page"].some(key => query.getAll(key).length !== 1) || query.get("sha") !== headSha || query.get("page") !== String(page + 1) || page + 1 > MAX_HISTORY_PAGES + 1 || query.get("per_page") !== String(perPage) || count === 0) throw new HistoryRequestError("GitHub returned mismatched history continuation.", 502);
    return page + 1;
}

async function fetchHistoryPage(context: RepositoryReadContext, headSha: string, page: number, perPage: number, signal?: AbortSignal): Promise<CommitHistoryPage> {
    signal?.throwIfAborted();
    validateHistoryRequest(headSha, page, perPage);
    const access = readContexts.get(context);
    if (!access) throw new HistoryRequestError();
    const repositoryPath = access.repositoryId ? `/repositories/${access.repositoryId}` : `/repos/${access.owner}/${access.repo}`;
    const path = `${repositoryPath}/commits?sha=${headSha}&per_page=${perPage}&page=${page}`;
    const { data, headers: responseHeaders } = await ghFetchResponse<Parameters<typeof mapApiCommit>[0][]>(path, access.token, { noStore: true }, signal, "error");
    if (!Array.isArray(data) || data.length > perPage) throw new HistoryRequestError("GitHub returned an invalid history page.", 502);
    const commits = data.map(mapApiCommit);
    const nextPage = historyContinuation(responseHeaders.get("Link"), access, headSha, page, perPage, commits.length);
    signal?.throwIfAborted();
    return { status: "ready", headSha, page, perPage, commits, nextPage };
}

export async function fetchCommitsPage(owner: string, repo: string, headSha: string, page: number, perPage: number, token?: string | null, signal?: AbortSignal): Promise<CommitHistoryPage> {
    signal?.throwIfAborted();
    validateHistoryRequest(headSha, page, perPage);
    return fetchHistoryPage(await authorizeRepositoryRead(owner, repo, token, signal), headSha, page, perPage, signal);
}

// --- Individual file content via GitHub contents API ---

// In-memory LRU for per-file content. Tab switches and file revisits hit the same
// path repeatedly; the underlying ghFetch uses noStore so without this each visit
// re-downloads the blob.
const FILE_CONTENT_TTL_MS = 5 * 60 * 1000;
const FILE_CONTENT_MAX_ENTRIES = 100;
const FILE_CONTENT_MAX_BYTES = 8 * 1024 * 1024;
const fileContentCache = new Map<string, { ts: number; content: string; bytes: number }>();
let fileContentCacheBytes = 0;

function fileCacheDelete(key: string): void {
    const hit = fileContentCache.get(key);
    if (hit) fileContentCacheBytes -= hit.bytes;
    fileContentCache.delete(key);
}

function fileCacheKey(snapshot: RepositorySnapshot, filePath: string): string {
    return JSON.stringify(["public-content-utf8-v1", repositorySnapshotKey(snapshot), filePath]);
}

function fileCacheGet(key: string): string | null {
    const hit = fileContentCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > FILE_CONTENT_TTL_MS) {
        fileCacheDelete(key);
        return null;
    }
    // LRU touch.
    fileContentCache.delete(key);
    fileContentCache.set(key, hit);
    return hit.content;
}

function fileCacheSet(key: string, content: string): void {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new ResponseTooLargeError();
    fileCacheDelete(key);
    while (fileContentCache.size >= FILE_CONTENT_MAX_ENTRIES || fileContentCacheBytes + bytes > FILE_CONTENT_MAX_BYTES) {
        const oldest = fileContentCache.keys().next().value;
        if (oldest === undefined) break;
        fileCacheDelete(oldest);
    }
    fileContentCache.set(key, { ts: Date.now(), content, bytes });
    fileContentCacheBytes += bytes;
}

async function readContent(access: ReadAccess, path: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    while (access.activeReads >= FILE_BATCH_CONCURRENCY) await new Promise<void>(resolve => access.waitingReads.push(resolve));
    access.activeReads++;
    try { signal?.throwIfAborted(); return await downloadContent(access, path, signal); }
    finally { access.activeReads--; access.waitingReads.shift()?.(); }
}

async function downloadContent(access: ReadAccess, path: string, signal?: AbortSignal): Promise<string> {
    const data = await ghFetch<{ type: string; size?: number; encoding?: string; content?: string; download_url?: string | null }>(path, access.token, { noStore: true }, signal);
    if (data.type !== "file") throw new GitHubApiError(404, path, "Not a file");
    if (typeof data.size === "number" && data.size > MAX_FILE_BYTES) throw new ResponseTooLargeError();
    if (data.encoding === "base64" && typeof data.content === "string") {
        const encoded = data.content.replace(/\s/g, "");
        if (Buffer.byteLength(encoded, "base64") > MAX_FILE_BYTES) throw new ResponseTooLargeError();
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.toString("base64") !== encoded) throw new Error("Invalid file content encoding");
        const content = bytes.toString("utf-8");
        if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new ResponseTooLargeError();
        return content;
    }
    if (data.encoding !== "none" && !data.download_url) throw new Error("File content not available");
    // Use the same pinned permission endpoint; never trust/retain an expiring download URL.
    const response = await fetch(`${GITHUB_API}${path}`, { headers: { ...headers(access.token), Accept: "application/vnd.github.raw+json" }, cache: "no-store", signal, redirect: "error" });
    signal?.throwIfAborted();
    if (!response.ok) {
        if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) throw new GitHubRateLimitError(retryDelay(response));
        throw new GitHubApiError(response.status, path, "Pinned file download unavailable");
    }
    const content = await readBoundedText(response, MAX_FILE_BYTES);
    signal?.throwIfAborted();
    return content;
}

export async function readFileAtSnapshot(context: RepositoryReadContext, snapshot: RepositorySnapshot, filePath: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const access = snapshotAccess(context, snapshot);
    if (snapshot.status !== "ready") throw new GitHubApiError(409, "snapshot", "Repository has no code snapshot");
    if (!filePath || filePath.length > 4096 || filePath.includes("..") || /[\\\x00-\x1f]/.test(filePath) || filePath.split("/").some(part => !part || part === ".")) throw new GitHubApiError(400, "snapshot", "Invalid file path");
    const key = fileCacheKey(snapshot, filePath);
    await verifySnapshotCommit(access, snapshot, signal);
    if (access.visibility === "public") {
        const cached = fileCacheGet(key);
        if (cached !== null) return cached;
    }
    let pending = access.files.get(key);
    if (!pending) {
        const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
        pending = readContent(access, `/repos/${access.owner}/${access.repo}/contents/${encodedPath}?ref=${snapshot.commitSha}`, signal).then(content => {
            signal?.throwIfAborted();
            if (access.visibility === "public") fileCacheSet(key, content);
            return content;
        }).catch(error => { access.files.delete(key); throw error; });
        access.files.set(key, pending);
    }
    const content = await pending;
    signal?.throwIfAborted();
    return content;
}

export async function fetchFileContent(owner: string, repo: string, filePath: string, token?: string | null, value?: RepositorySnapshot, signal?: AbortSignal): Promise<string> {
    const snapshot = parseRepositorySnapshot(value, owner, repo);
    return readFileAtSnapshot(await authorizeRepositoryRead(owner, repo, token, signal), snapshot, filePath, signal);
}

// --- Fetch all repo data in parallel ---

/** A Git ref points at a commit, whose tree is a different Git object. */
async function captureSnapshot(owner: string, repo: string, metadata: RepoMetadata, visibility: "public" | "private", token?: string | null): Promise<RepositorySnapshot> {
    const base = { schemaVersion: 1, owner, repo, selectedBranch: metadata.defaultBranch, defaultBranch: metadata.defaultBranch, visibility, capturedAt: new Date().toISOString() };
    let commitSha: string;
    try {
        const ref = await ghFetch<{ object: { type: string; sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(metadata.defaultBranch)}`, token, { noStore: true });
        if (ref.object.type !== "commit") throw new RepositorySnapshotError();
        commitSha = gitShaSchema.parse(ref.object.sha);
    } catch (error) {
        // A generic 404/409, denial or rate limit does not establish an empty repo.
        if (error instanceof GitHubApiError && error.status === 409 && error.responseMessage === "Git Repository is empty.") return parseRepositorySnapshot({ ...base, status: "empty", commitSha: null, treeSha: null });
        throw error;
    }
    const commit = await ghFetch<{ sha: string; tree: { sha: string } }>(`/repos/${owner}/${repo}/git/commits/${commitSha}`, token, { noStore: true });
    if (commit.sha !== commitSha) throw new RepositorySnapshotError();
    return parseRepositorySnapshot({ ...base, status: "ready", commitSha, treeSha: commit.tree.sha });
}

/** Browser identifiers are checked behind a fresh access gate and a commit read. */
export async function fetchRepositorySnapshotTree(owner: string, repo: string, value: unknown, token?: string | null) {
    const snapshot = parseRepositorySnapshot(value, owner, repo);
    const context = await authorizeRepositoryRead(owner, repo, token);
    const access = snapshotAccess(context, snapshot);
    const effectiveToken = access.token;
    if (snapshot.status === "empty") {
        const metadata = await fetchRepoMetadata(owner, repo, effectiveToken, { noStore: true });
        const verified = await captureSnapshot(owner, repo, metadata, snapshot.visibility, effectiveToken);
        if (verified.status !== "empty" || verified.defaultBranch !== snapshot.defaultBranch) throw new RepositorySnapshotError();
        return { snapshot, fileTree: null };
    }
    const commit = await ghFetch<{ sha: string; tree: { sha: string } }>(`/repos/${owner}/${repo}/git/commits/${snapshot.commitSha}`, effectiveToken, { noStore: true });
    if (commit.sha !== snapshot.commitSha || commit.tree.sha !== snapshot.treeSha) throw new RepositorySnapshotError();
    const fileTree = await fetchFileTree(owner, repo, snapshot.treeSha, effectiveToken, { noStore: true });
    if (fileTree.sha !== snapshot.treeSha) throw new RepositorySnapshotError();
    return { snapshot, fileTree };
}

function githubSectionError(error: unknown, subject: string): SectionError {
    const status = error instanceof GitHubApiError ? error.status : error instanceof GitHubRateLimitError ? 429 : error instanceof ResponseTooLargeError ? 413 : 502;
    return sectionError(status, subject, error instanceof GitHubRateLimitError ? error.retryAfter : undefined);
}

async function optionalSection<T>(load: () => Promise<T>, subject: string): Promise<SectionResult<T>> {
    try { return { status: "ready", data: await load() }; }
    catch (error) { return { status: "error", error: githubSectionError(error, subject) }; }
}

async function _fetchAllRepoDataImpl(snapshot: RepositorySnapshot, metadata: RepoMetadata, metadataObservedAt: string, context: RepositoryReadContext) {
    const token = readContexts.get(context)!.token;
    const { owner, repo } = snapshot;
    const observations: RepositoryObservations = {
        metadata: { status: "ready", observedAt: metadataObservedAt },
        contributors: { status: "ready", observedAt: metadataObservedAt },
        languages: { status: "ready", observedAt: metadataObservedAt },
    };
    const contributorsP: Promise<SectionResult<Contributor[]>> = fetchContributors(owner, repo, token)
        .then(result => sectionWithData(result.data, result.errors, result.data.length > 0))
        .catch(error => ({ status: "error" as const, error: githubSectionError(error, "Contributors") }))
        .then(section => { observations.contributors = { observedAt: new Date().toISOString(), status: section.status === "ready" ? "ready" : section.status === "partial" ? "partial" : "error" }; return section; });
    const languagesP = optionalSection(() => fetchLanguages(owner, repo, token), "Language statistics")
        .then(section => { observations.languages = { observedAt: new Date().toISOString(), status: section.status === "ready" ? "ready" : "error" }; return section; });
    const [contributors, languages] = await Promise.all([contributorsP, languagesP]);
    const branchesP: Promise<SectionResult<Branch[]>> = snapshot.status === "empty" ? Promise.resolve({ status: "ready", data: [] }) : optionalSection(async () => {
        const branches = await fetchBranches(owner, repo, snapshot.defaultBranch, token);
        return branches.map(branch => branch.isDefault ? { ...branch, sha: snapshot.commitSha!, headSha: snapshot.commitSha!, capturedAt: snapshot.capturedAt } : branch);
    }, "Branch list").then(section => section.status === "ready" && section.data.length === 20 ? { status: "partial", data: section.data, errors: [{ code: "limited", message: "Only the first 20 branches are loaded; the repository may have additional branches." }] } : section);
    const fileTreeP = snapshot.status === "empty" ? Promise.resolve(null) : fetchFileTree(owner, repo, snapshot.treeSha, token, { noStore: true });
    const [fileTree, branches, history, readme, dependencyFiles, mergedPRs] = await Promise.all([
        fileTreeP, branchesP,
        branchesP.then(section => fetchCommitsForDAG(context, snapshot, sectionData(section, []))),
        optionalSection(() => fetchReadme(context, snapshot), "Pinned README"),
        fetchDependencyFiles(context, snapshot, undefined, fileTreeP).then(result => result.section).catch(error => ({ status: "error" as const, error: githubSectionError(error, "Dependency manifests") })),
        optionalSection(() => fetchMergedPRs(owner, repo, 1, token), "Merged pull requests"),
    ]);
    if (snapshot.status === "ready" && fileTree?.sha !== snapshot.treeSha) throw new RepositorySnapshotError();
    const sections: RepositorySections = { contributors, languages, branches, dependencyFiles, readme, mergedPRs };
    return {
        schemaVersion: 2 as const, sections, snapshot, observations, metadata, fileTree, ...history,
        // Compatibility aliases: current readers use sections rather than infer success from emptiness.
        contributors: sectionData(contributors, []), contributorsTruncated: contributors.status === "partial",
        contributorsFetchError: contributors.status === "error" ? contributors.error.code === "rate_limited" ? "rate_limited" : "fetch_failed" : null,
        branches: sectionData(branches, []), languages: sectionData(languages, {}),
        readme: sectionData(readme, ""), readmeFetchError: readme.status === "error" ? readme.error.message : null,
        dependencyFiles: sectionData(dependencyFiles, []), dependencyFilesFetchError: dependencyFiles.status === "partial" ? dependencyFiles.errors[0].message : dependencyFiles.status === "error" ? dependencyFiles.error.message : null,
        mergedPRs: sectionData(mergedPRs, []),
    };
}

// Only public aggregates share work; credentials never enter persistent arguments/keys.
const inflight = new Map<string, ReturnType<typeof _fetchAllRepoDataImpl>>();
function deduplicatedFetch(snapshot: RepositorySnapshot, metadata: RepoMetadata, observedAt: string, context: RepositoryReadContext) {
    const key = repositorySnapshotKey(snapshot)!;
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = _fetchAllRepoDataImpl(snapshot, metadata, observedAt, context).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

export async function fetchAllRepoData(owner: string, repo: string, token?: string | null) {
    const context = await authorizeRepositoryRead(owner, repo, token);
    const access = readContexts.get(context)!;
    const effectiveToken = access.token;
    const metadata = await fetchRepoMetadata(owner, repo, effectiveToken, { noStore: true });
    if (!metadata.visibility) throw new GitHubApiError(502, `/repos/${owner}/${repo}`, "Repository visibility unavailable");
    if (!token?.trim() && metadata.visibility !== "public") throw new GitHubApiError(404, `/repos/${owner}/${repo}`, "Repository unavailable");
    if (metadata.visibility !== access.visibility) throw new RepositorySnapshotError();
    const observedAt = new Date().toISOString();
    const snapshot = await captureSnapshot(owner, repo, metadata, metadata.visibility, effectiveToken);
    if (snapshot.status === "ready") access.commits.set(`${snapshot.commitSha}:${snapshot.treeSha}`, Promise.resolve());
    if (token?.trim()) return _fetchAllRepoDataImpl(snapshot, metadata, observedAt, context);
    // Cache the entire captured payload. Never relabel an old payload with new identity/time.
    return unstable_cache(() => deduplicatedFetch(snapshot, metadata, observedAt, context), ["repo-data-v9-section-coverage", repositorySnapshotKey(snapshot)!], { revalidate: 300 })();
}
