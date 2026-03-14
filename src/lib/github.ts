// ============================================================================
// GitViz — GitHub API Service
// ============================================================================

import type {
    RepoMetadata,
    FileTreeResponse,
    Contributor,
    Branch,
    Commit,
    MergedPR,
    LanguageStats,
} from "@/types";

const GITHUB_API = "https://api.github.com";

function headers(token?: string | null): HeadersInit {
    const h: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
    };
    if (token) {
        h.Authorization = `Bearer ${token}`;
    }
    return h;
}

async function ghFetch<T>(path: string, token?: string | null): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
        headers: headers(token),
        next: { revalidate: 300 }, // 5 minute ISR cache
    });

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
        token
    );
    return {
        sha: data.sha,
        tree: data.tree.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item: any) => ({
                path: item.path,
                mode: item.mode,
                type: item.type,
                sha: item.sha,
                size: item.size,
                url: item.url,
            })
        ),
        truncated: data.truncated,
    };
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

export async function fetchCommits(
    owner: string,
    repo: string,
    branch?: string,
    token?: string | null
): Promise<Commit[]> {
    const params = branch
        ? `?sha=${branch}&per_page=100&page=1`
        : `?per_page=100&page=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ghFetch<any[]>(
        `/repos/${owner}/${repo}/commits${params}`,
        token
    );
    return data.map((c) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        authorName: c.commit.author.name,
        authorLogin: c.author?.login ?? null,
        authorAvatar: c.author?.avatar_url ?? null,
        date: c.commit.author.date,
    }));
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

// --- Architecture Analysis File Contents ---

const ARCHITECTURE_CODE_EXTENSIONS = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "mts",
    "cts",
    "mjs",
    "cjs",
]);

const ARCHITECTURE_SKIP_SEGMENTS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "vendor",
    "generated",
    "__snapshots__",
];

function scoreArchitecturePath(path: string): number {
    const lower = path.toLowerCase();
    let score = 0;

    if (lower.includes("/app/") || lower.includes("/pages/")) score += 80;
    if (lower.includes("/components/")) score += 70;
    if (lower.includes("/core/") || lower.includes("/lib/") || lower.includes("/engine/")) score += 65;
    if (lower.includes("/hooks/") || lower.includes("use")) score += 60;
    if (lower.includes("/api/") || lower.includes("/services/") || lower.includes("route.")) score += 55;
    if (lower.includes("test") || lower.includes("spec")) score += 30;

    if (lower.endsWith("/page.tsx") || lower.endsWith("/layout.tsx")) score += 40;
    if (lower.endsWith("index.ts") || lower.endsWith("index.tsx")) score += 25;

    return score;
}

function selectArchitectureFiles(
    tree: FileTreeResponse["tree"],
    maxFiles: number
): string[] {
    const candidates = tree
        .filter((item) => item.type === "blob")
        .filter((item) => {
            const lower = item.path.toLowerCase();
            if (ARCHITECTURE_SKIP_SEGMENTS.some((segment) => lower.includes(`/${segment}/`) || lower.startsWith(`${segment}/`))) {
                return false;
            }
            if (lower.endsWith(".d.ts")) return false;
            const ext = lower.split(".").pop() ?? "";
            return ARCHITECTURE_CODE_EXTENSIONS.has(ext);
        })
        .map((item) => ({
            path: item.path,
            size: item.size ?? 0,
            score: scoreArchitecturePath(item.path),
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.size !== b.size) return a.size - b.size;
            return a.path.localeCompare(b.path);
        });

    return candidates.slice(0, maxFiles).map((item) => item.path);
}

export async function fetchArchitectureFileContents(
    owner: string,
    repo: string,
    tree: FileTreeResponse["tree"],
    token?: string | null,
    options?: { maxFiles?: number; maxCharsPerFile?: number }
): Promise<Array<{ path: string; content: string }>> {
    const maxFiles = Math.max(10, Math.min(options?.maxFiles ?? 40, 80));
    const maxCharsPerFile = Math.max(1500, Math.min(options?.maxCharsPerFile ?? 14000, 30000));
    const selectedPaths = selectArchitectureFiles(tree, maxFiles);

    const responses = await Promise.allSettled(
        selectedPaths.map(async (path) => {
            const res = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`,
                { headers: headers(token) }
            );
            if (!res.ok) throw new Error(`Failed to fetch ${path}`);
            const raw = await res.text();
            return {
                path,
                content: raw.length > maxCharsPerFile ? raw.slice(0, maxCharsPerFile) : raw,
            };
        })
    );

    return responses
        .filter(
            (result): result is PromiseFulfilledResult<{ path: string; content: string }> =>
                result.status === "fulfilled"
        )
        .map((result) => result.value)
        .filter((entry) => entry.content.trim().length > 0);
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

    const [fileTree, branches, commits, readme, dependencyFiles, mergedPRs] =
        await Promise.all([
            fetchFileTree(owner, repo, metadata.defaultBranch, token).catch(
                () => null
            ),
            fetchBranches(owner, repo, metadata.defaultBranch, token).catch(
                () => []
            ),
            fetchCommits(owner, repo, metadata.defaultBranch, token).catch(
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
