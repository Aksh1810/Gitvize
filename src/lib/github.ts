// ============================================================================
// GitViz — GitHub API Service
// ============================================================================

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

type FetchCacheMode =
    | { revalidate: number }
    | { noStore: true };

function headers(token?: string | null): HeadersInit {
    const h: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
    };
    // Fall back to the server-side env token so every ghFetch call is
    // authenticated even when no user token was explicitly threaded through.
    const normalizedToken = (token ?? process.env.GITHUB_TOKEN)?.trim();
    if (normalizedToken) {
        // GitHub PAT auth is most broadly compatible with the `token` scheme.
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
        { noStore: true }
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
): Promise<Contributor[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/contributors?per_page=30`,
        token
    );
    return data.map((c) => ({
        login: c.login,
        id: c.id,
        avatarUrl: c.avatar_url,
        contributions: c.contributions,
        htmlUrl: c.html_url,
    }));
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
                { noStore: true }
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
                { noStore: true }
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

// --- Latest Commit SHA (for cache key) ---

export async function fetchLatestSha(
    owner: string,
    repo: string,
    token?: string | null
): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/commits?per_page=1`,
        token
    );
    return data[0]?.sha ?? "";
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

// --- Commit author map (email → GitHub login/avatar) ---
// Fetches recent commits from the GitHub API. Each commit carries both the
// git author email and the linked GitHub account, giving us a reliable
// email-to-profile mapping to enrich local git contributor data.

export async function fetchCommitAuthorMap(
    owner: string,
    repo: string,
    token?: string | null,
): Promise<Map<string, { login: string; avatarUrl: string; htmlUrl: string }>> {
    type GHCommit = {
        commit: { author: { email: string } };
        author: { login: string; avatar_url: string; html_url: string } | null;
    };
    const commits = await ghFetch<GHCommit[]>(
        `/repos/${owner}/${repo}/commits?per_page=100`,
        token,
    ).catch(() => [] as GHCommit[]);

    const map = new Map<string, { login: string; avatarUrl: string; htmlUrl: string }>();
    for (const c of commits) {
        if (!c.author) continue;
        const email = c.commit.author.email?.toLowerCase();
        if (email && !map.has(email)) {
            map.set(email, {
                login: c.author.login,
                avatarUrl: c.author.avatar_url,
                htmlUrl: c.author.html_url,
            });
        }
    }
    return map;
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
        { noStore: true },
    );
    return data.map(mapApiCommit);
}

// --- Individual file content via GitHub contents API ---

export async function fetchFileContent(
    owner: string,
    repo: string,
    filePath: string,
    token?: string | null,
): Promise<string> {
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
        return rawRes.text();
    }

    if (data.type !== "file") throw new Error("Not a file");

    if (data.encoding === "base64" && typeof data.content === "string") {
        return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    }

    // GitHub provides download_url for files it can't inline (e.g. large blobs).
    if (typeof data.download_url === "string") {
        const rawRes = await fetch(data.download_url);
        if (!rawRes.ok) throw new Error("Failed to download file");
        return rawRes.text();
    }

    throw new Error("File content not available");
}

// --- Fetch all repo data in parallel ---

export async function fetchAllRepoData(
    owner: string,
    repo: string,
    token?: string | null
) {
    const [metadata, contributors, languages] = await Promise.all([
        fetchRepoMetadata(owner, repo, token),
        fetchContributors(owner, repo, token).catch(() => []),
        fetchLanguages(owner, repo, token).catch(() => ({})),
    ]);

    // Fetch branches first so their HEAD SHAs can seed the multi-branch commit fetch
    const branches = await fetchBranches(owner, repo, metadata.defaultBranch, token).catch(() => []);

    const [fileTree, commits, readme, dependencyFiles, mergedPRs] =
        await Promise.all([
            fetchFileTree(owner, repo, metadata.defaultBranch, token).catch(
                () => null
            ),
            fetchCommitsForDAG(owner, repo, metadata.defaultBranch, branches, token).catch(
                () => []
            ),
            fetchReadme(owner, repo, token).catch(() => ""),
            fetchDependencyFiles(owner, repo, token).catch(() => []),
            fetchMergedPRs(owner, repo, 1, token).catch(() => []),
        ]);

    return {
        metadata,
        fileTree,
        contributors,
        branches,
        commits,
        readme,
        languages,
        dependencyFiles,
        mergedPRs,
    };
}
