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
    const normalizedToken = token?.trim();
    if (normalizedToken) {
        // GitHub PAT auth is most broadly compatible with the `token` scheme.
        h.Authorization = `token ${normalizedToken}`;
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

// --- Lightweight Access Check ---

export async function checkRepoAccess(
    owner: string,
    repo: string,
    token?: string | null
): Promise<{ ok: boolean; status: number; isPrivate: boolean; fullName?: string }> {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: headers(token),
        next: { revalidate: 60 },
    });

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
