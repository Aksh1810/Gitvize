// ============================================================================
// GitViz — GitHub API Service
// ============================================================================

import { unstable_cache } from "next/cache";
import type {
    RepoMetadata,
    FileTreeResponse,
    TreeItem,
    Contributor,
    Branch,
    Commit,
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
    const normalizedToken = (token ?? getNextServerToken())?.trim();
    if (normalizedToken) {
        h.Authorization = `token ${normalizedToken}`;
    }
    return h;
}

async function ghFetch<T>(
    path: string,
    token?: string | null,
    cacheMode: FetchCacheMode = { revalidate: 300 }
): Promise<T> {
    const url = `${GITHUB_API}${path}`;
    const fetchInit =
        "noStore" in cacheMode
            ? {
                headers: headers(token),
                cache: "no-store" as const,
            }
            : {
                headers: headers(token),
                next: { revalidate: cacheMode.revalidate },
            };

    let res = await fetch(url, fetchInit);

    // If the provided token is invalid/expired, retry unauthenticated so
    // public repositories still work instead of failing with 401/403.
    if ((res.status === 401 || res.status === 403) && token?.trim()) {
        const fallbackInit =
            "noStore" in cacheMode
                ? {
                    headers: headers(null),
                    cache: "no-store" as const,
                }
                : {
                    headers: headers(null),
                    next: { revalidate: cacheMode.revalidate },
                };
        res = await fetch(url, fallbackInit);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GitHub API error ${res.status} for ${path}: ${body}`);
    }

    const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "9999", 10);
    const limit = parseInt(res.headers.get("x-ratelimit-limit") ?? "5000", 10);
    if (remaining < limit * 0.2) {
        console.warn(`[github] Rate limit low: ${remaining}/${limit} remaining for ${path}`);
    }

    return res.json();
}

// --- Repository Metadata ---

export async function fetchRepoMetadata(
    owner: string,
    repo: string,
    token?: string | null
): Promise<RepoMetadata> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any>(`/repos/${owner}/${repo}`, token);
    return {
        owner,
        repo,
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
    branch?: string,
    token?: string | null
): Promise<FileTreeResponse> {
    const ref = branch ?? "HEAD";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any>(
        `/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
        token,
        { revalidate: 120 }
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

    return { sha: data.sha, tree, truncated };
}

// --- README ---

export async function fetchReadme(
    owner: string,
    repo: string,
    token?: string | null
): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await ghFetch<any>(`/repos/${owner}/${repo}/readme`, token);
        return atob(data.content);
    } catch {
        return "";
    }
}

// --- Contributors ---

export async function fetchContributors(
    owner: string,
    repo: string,
    token?: string | null
): Promise<{ data: Contributor[]; truncated: boolean }> {
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
            if (result.status !== "fulfilled" || result.value.length === 0) break;
            all.push(...result.value.map(mapItem));
            if (result.value.length < 100) break;
        }
    }

    return { data: all, truncated: all.length === 500 };
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
    return data.map((b) => ({
        name: b.name,
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
    const base = branch ? `?sha=${branch}&per_page=100` : `?per_page=100`;

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

/**
 * Fetches commits from the default branch (up to 500) PLUS one page from each
 * non-default branch whose HEAD SHA is not already in the default branch history.
 * This ensures that active unmerged branches appear in the commit graph for
 * large repos where branches haven't been merged to main yet.
 */
async function fetchCommitsForDAG(
    owner: string,
    repo: string,
    defaultBranch: string,
    branches: Branch[],
    token?: string | null
): Promise<Commit[]> {
    // Phase 1: fetch 5 pages from the default branch in parallel
    const base = `?sha=${defaultBranch}&per_page=100`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultPages = await Promise.allSettled<any[]>(
        [1, 2, 3, 4, 5].map((page) =>
            ghFetch<any[]>(
                `/repos/${owner}/${repo}/commits${base}&page=${page}`,
                token,
                { revalidate: 120 }
            )
        )
    );

    const seen = new Set<string>();
    const all: Commit[] = [];

    for (const result of defaultPages) {
        if (result.status !== "fulfilled") continue;
        for (const c of result.value) {
            if (seen.has(c.sha)) continue;
            seen.add(c.sha);
            all.push(mapApiCommit(c));
        }
    }

    // Phase 2: for each non-default branch whose HEAD is NOT yet in our set,
    // fetch one page of commits so its history appears in the graph
    const missingBranches = branches
        .filter((b) => !b.isDefault && !seen.has(b.sha))
        .slice(0, 5); // cap at 5 extra branches to limit API calls and avoid rate exhaustion

    if (missingBranches.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const branchPages = await Promise.allSettled<any[]>(
            missingBranches.map((b) =>
                ghFetch<any[]>(
                    `/repos/${owner}/${repo}/commits?sha=${b.sha}&per_page=100&page=1`,
                    token,
                    { noStore: true }
                )
            )
        );

        for (const result of branchPages) {
            if (result.status !== "fulfilled") continue;
            for (const c of result.value) {
                if (seen.has(c.sha)) continue;
                seen.add(c.sha);
                all.push(mapApiCommit(c));
            }
        }
    }

    return all.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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

export async function checkRepoAccess(
    owner: string,
    repo: string,
    token?: string | null
): Promise<{ ok: boolean; status: number; isPrivate: boolean; fullName?: string }> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;

    let res = await fetch(url, {
        headers: headers(token),
        next: { revalidate: 60 },
    });

    // If a stored token is invalid/expired, retry without auth so public
    // repositories can still be resolved.
    if ((res.status === 401 || res.status === 403) && token?.trim()) {
        res = await fetch(url, {
            headers: headers(null),
            next: { revalidate: 60 },
        });
    }

    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            isPrivate: false,
        };
    }

    const data = await res.json() as { private?: boolean; full_name?: string };
    return {
        ok: true,
        status: 200,
        isPrivate: Boolean(data.private),
        fullName: data.full_name,
    };
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

export async function fetchDependencyFiles(
    owner: string,
    repo: string,
    token?: string | null
): Promise<{ filename: string; content: string }[]> {
    const results = await Promise.allSettled(
        MANIFEST_FILES.map(async (filename) => {
            const res = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filename}`,
                { headers: headers(token) }
            );
            if (!res.ok) throw new Error("Not found");
            const content = await res.text();
            return { filename, content };
        })
    );

    return results
        .filter(
            (r): r is PromiseFulfilledResult<{ filename: string; content: string }> =>
                r.status === "fulfilled"
        )
        .map((r) => r.value);
}

// --- Paginated commits (used by branch-graph "load more") ---

export async function fetchCommitsPage(
    owner: string,
    repo: string,
    sha: string,
    page: number,
    perPage: number,
    token?: string | null,
): Promise<Commit[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(sha)}&per_page=${perPage}&page=${page}`,
        token,
        { revalidate: 60 },
    );
    return data.map(mapApiCommit);
}

// --- Individual file content via GitHub contents API ---

// In-memory LRU for per-file content. Tab switches and file revisits hit the same
// path repeatedly; the underlying ghFetch uses noStore so without this each visit
// re-downloads the blob.
const FILE_CONTENT_TTL_MS = 5 * 60 * 1000;
const FILE_CONTENT_MAX_ENTRIES = 100;
const fileContentCache = new Map<string, { ts: number; content: string }>();

function fileCacheKey(owner: string, repo: string, filePath: string, token?: string | null): string {
    // Token bucket prevents one user's private content from leaking to another in dev.
    const tokenBucket = token ? token.slice(0, 8) : "anon";
    return `${tokenBucket}:${owner}/${repo}:${filePath}`;
}

function fileCacheGet(key: string): string | null {
    const hit = fileContentCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > FILE_CONTENT_TTL_MS) {
        fileContentCache.delete(key);
        return null;
    }
    // LRU touch.
    fileContentCache.delete(key);
    fileContentCache.set(key, hit);
    return hit.content;
}

function fileCacheSet(key: string, content: string): void {
    if (fileContentCache.size >= FILE_CONTENT_MAX_ENTRIES) {
        const oldest = fileContentCache.keys().next().value;
        if (oldest !== undefined) fileContentCache.delete(oldest);
    }
    fileContentCache.set(key, { ts: Date.now(), content });
}

export async function fetchFileContent(
    owner: string,
    repo: string,
    filePath: string,
    token?: string | null,
): Promise<string> {
    const cacheKey = fileCacheKey(owner, repo, filePath, token);
    const cached = fileCacheGet(cacheKey);
    if (cached !== null) return cached;

    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
        data = await ghFetch<any>(
            `/repos/${owner}/${repo}/contents/${encodedPath}`,
            token,
            { noStore: true },
        );
    } catch {
        // GitHub returns 403/404 for blobs > 1 MB — fall back to raw content.
        const rawRes = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filePath}`,
            token ? { headers: { Authorization: `token ${token}` } } : {},
        );
        if (!rawRes.ok) throw new Error(`File not found: ${filePath}`);
        const text = await rawRes.text();
        fileCacheSet(cacheKey, text);
        return text;
    }

    if (data.type !== "file") throw new Error("Not a file");

    if (data.encoding === "base64" && typeof data.content === "string") {
        const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
        fileCacheSet(cacheKey, decoded);
        return decoded;
    }

    // GitHub provides download_url for files it can't inline (e.g. large blobs).
    if (typeof data.download_url === "string") {
        const rawRes = await fetch(data.download_url);
        if (!rawRes.ok) throw new Error("Failed to download file");
        const text = await rawRes.text();
        fileCacheSet(cacheKey, text);
        return text;
    }

    throw new Error("File content not available");
}

// --- Fetch all repo data in parallel ---

async function _fetchAllRepoDataImpl(
    owner: string,
    repo: string,
    token?: string | null
) {
    let contributorsFetchError: string | null = null;
    const [metadata, contributorsResult, languages] = await Promise.all([
        fetchRepoMetadata(owner, repo, token),
        fetchContributors(owner, repo, token).catch((err) => {
            const msg = (err as Error)?.message ?? String(err);
            console.warn("[contributors] fetch failed:", msg);
            contributorsFetchError = /rate.?limit|secondary.?rate/i.test(msg)
                ? "rate_limited"
                : "fetch_failed";
            return { data: [] as Contributor[], truncated: false };
        }),
        fetchLanguages(owner, repo, token).catch(() => ({})),
    ]);
    const contributors = contributorsResult.data;
    const contributorsTruncated = contributorsResult.truncated;

    // Branches feed fetchCommitsForDAG; let it overlap with the other independent fetches.
    const branchesP = fetchBranches(owner, repo, metadata.defaultBranch, token).catch(
        () => [] as Branch[],
    );

    const [fileTree, branches, commits, readme, dependencyFiles, mergedPRs] =
        await Promise.all([
            fetchFileTree(owner, repo, metadata.defaultBranch, token).catch(
                () => null
            ),
            branchesP,
            branchesP.then((b) =>
                fetchCommitsForDAG(owner, repo, metadata.defaultBranch, b, token).catch(
                    () => []
                ),
            ),
            fetchReadme(owner, repo, token).catch(() => ""),
            fetchDependencyFiles(owner, repo, token).catch(() => []),
            fetchMergedPRs(owner, repo, 1, token).catch(() => []),
        ]);

    return {
        metadata,
        fileTree,
        contributors,
        contributorsTruncated,
        contributorsFetchError,
        branches,
        commits,
        readme,
        languages,
        dependencyFiles,
        mergedPRs,
    };
}

// In-flight deduplication: collapses concurrent cold-cache bursts for the same
// repo onto a single Promise so only one GitHub API fan-out runs at a time.
const inflight = new Map<string, ReturnType<typeof _fetchAllRepoDataImpl>>();

function deduplicatedFetch(owner: string, repo: string) {
    const key = `${owner}/${repo}`;
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = _fetchAllRepoDataImpl(owner, repo, null).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
}

// Server-side 5-minute cache backed by Vercel Data Cache (or Next.js in-process
// cache in dev). Each unique (owner, repo) pair gets its own cache entry.
const cachedFetchAllRepoData = unstable_cache(
    deduplicatedFetch,
    ["repo-data-v1"],
    { revalidate: 300 }
);

export async function fetchAllRepoData(
    owner: string,
    repo: string,
    token?: string | null
) {
    const serverToken = process.env.GITHUB_TOKEN?.trim();
    const isUserToken = !!token?.trim() && token.trim() !== serverToken;
    if (isUserToken) {
        // User's own PAT (private repo) — never serve cached content
        return _fetchAllRepoDataImpl(owner, repo, token);
    }
    return cachedFetchAllRepoData(owner, repo);
}
