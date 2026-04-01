// ============================================================================
// GitViz — Local Git Repository Data Provider
// ============================================================================
// Clones repos to /tmp and reads data via git CLI (simple-git) instead of
// calling the GitHub API. Returns the exact same shapes the frontend expects.

import simpleGit, { type SimpleGit } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import type {
    FileTreeResponse,
    TreeItem,
    Contributor,
    Branch,
    Commit,
} from "@/types";

// ── Config ───────────────────────────────────────────────────────────────────

const CLONE_BASE = "/tmp/gitviz-repos";
const CLONE_TIMEOUT_MS = 120_000; // 2 min max for clone
const MAX_COMMITS = 500;

// ── Clone lock (prevents concurrent clones of the same repo) ─────────────────

const cloneLocks = new Map<string, Promise<void>>();

// ── Result type (everything that can come from local git) ────────────────────

export interface LocalGitResult {
    fileTree: FileTreeResponse | null;
    contributors: Contributor[];
    branches: Branch[];
    commits: Commit[];
    readme: string;
    dependencyFiles: { filename: string; content: string }[];
}

// ── Core: clone or fetch ─────────────────────────────────────────────────────

async function getRepo(owner: string, repo: string): Promise<{ git: SimpleGit; repoDir: string }> {
    const repoDir = path.join(CLONE_BASE, owner, repo);
    const key = `${owner}/${repo}`;

    // Wait for any in-flight clone of the same repo
    const pending = cloneLocks.get(key);
    if (pending) await pending;

    const gitDir = path.join(repoDir, ".git");
    let needsClone = false;

    try {
        await fs.access(gitDir);
    } catch {
        needsClone = true;
    }

    if (needsClone) {
        const clonePromise = (async () => {
            await fs.mkdir(path.join(CLONE_BASE, owner), { recursive: true });
            const url = `https://github.com/${owner}/${repo}.git`;
            await simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } })
                .clone(url, repoDir);
        })();
        cloneLocks.set(key, clonePromise);
        try {
            await clonePromise;
        } finally {
            cloneLocks.delete(key);
        }
    }

    const git = simpleGit(repoDir, { timeout: { block: 30_000 } });

    if (!needsClone) {
        // Already cloned — fetch latest
        await git.fetch(["--all", "--prune"]).catch(() => { /* ignore fetch errors */ });
    }

    return { git, repoDir };
}

// ── Branches ─────────────────────────────────────────────────────────────────

async function readBranches(git: SimpleGit, defaultBranch: string): Promise<Branch[]> {
    const raw = await git.raw(["branch", "-a", "--format=%(refname:short) %(objectname)"]);
    const seen = new Set<string>();
    const branches: Branch[] = [];

    for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const spaceIdx = line.lastIndexOf(" ");
        if (spaceIdx === -1) continue;

        let name = line.slice(0, spaceIdx).trim();
        const sha = line.slice(spaceIdx + 1).trim();

        // Normalise remote branches: "origin/main" → "main"
        if (name.startsWith("origin/")) name = name.slice(7);
        if (name === "HEAD") continue;
        if (seen.has(name)) continue;
        seen.add(name);

        branches.push({ name, sha, isDefault: name === defaultBranch });
    }

    return branches;
}

// ── Commits (with parents for DAG) ───────────────────────────────────────────

async function readCommits(git: SimpleGit): Promise<Commit[]> {
    // One record per line, fields separated by null bytes within each line.
    const raw = await git.raw([
        "log", "--all", "--topo-order",
        "--format=%H%x00%h%x00%s%x00%an%x00%aI%x00%P",
        `-n`, String(MAX_COMMITS),
    ]);

    const commits: Commit[] = [];
    const seen = new Set<string>();

    for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\0");
        if (parts.length < 6) continue;

        const sha = parts[0].trim();
        const shortSha = parts[1].trim();
        const message = parts[2].trim();
        const authorName = parts[3].trim();
        const date = parts[4].trim();
        const parentsStr = parts[5].trim();

        if (!sha || seen.has(sha)) continue;
        seen.add(sha);

        commits.push({
            sha,
            shortSha,
            message,
            authorName,
            authorLogin: null,
            authorAvatar: null,
            date,
            parents: parentsStr ? parentsStr.split(" ") : [],
        });
    }

    return commits.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

// ── File tree ────────────────────────────────────────────────────────────────

async function readFileTree(
    git: SimpleGit,
    defaultBranch: string
): Promise<FileTreeResponse | null> {
    const raw = await git.raw(["ls-tree", "-r", "--long", defaultBranch]);
    const tree: TreeItem[] = [];

    for (const line of raw.trim().split("\n")) {
        if (!line) continue;
        // Format: <mode> <type> <sha>       <size>\t<path>
        const match = line.match(
            /^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\s+(\d+|-)\t(.+)$/
        );
        if (!match) continue;
        const [, mode, type, sha, sizeStr, filePath] = match;
        tree.push({
            path: filePath,
            mode,
            type: type as "blob" | "tree",
            sha,
            size: sizeStr === "-" ? undefined : parseInt(sizeStr, 10),
            url: "",
        });
    }

    const rootSha = (
        await git.raw(["rev-parse", `${defaultBranch}^{tree}`])
    ).trim();

    return { sha: rootSha, tree, truncated: false };
}

// ── Contributors ─────────────────────────────────────────────────────────────

async function readContributors(git: SimpleGit): Promise<Contributor[]> {
    const raw = await git.raw(["shortlog", "-sne", "--all"]);

    // Deduplicate by email: same person may commit with different names
    const byEmail = new Map<string, { name: string; email: string; contributions: number }>();

    for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const match = line.trim().match(/^(\d+)\t(.+?)\s+<(.+?)>$/);
        if (!match) continue;
        const [, countStr, name, email] = match;
        const emailKey = email.toLowerCase();
        const count = parseInt(countStr, 10);

        const existing = byEmail.get(emailKey);
        if (existing) {
            existing.contributions += count;
            // Keep the longer name as it's likely the more complete one
            if (name.length > existing.name.length) {
                existing.name = name;
            }
        } else {
            byEmail.set(emailKey, { name, email, contributions: count });
        }
    }

    let id = 1;
    const contributors: Contributor[] = [];
    for (const entry of byEmail.values()) {
        contributors.push({
            login: entry.name,
            id: id++,
            avatarUrl: "",
            contributions: entry.contributions,
            htmlUrl: "",
            email: entry.email,
            name: entry.name,
        });
    }

    return contributors
        .sort((a, b) => b.contributions - a.contributions)
        .slice(0, 30);
}

// ── README ───────────────────────────────────────────────────────────────────

async function readReadme(repoDir: string): Promise<string> {
    const candidates = [
        "README.md", "readme.md", "Readme.md",
        "README", "README.txt", "README.rst",
    ];
    for (const name of candidates) {
        try {
            return await fs.readFile(path.join(repoDir, name), "utf-8");
        } catch {
            // try next
        }
    }
    return "";
}

// ── Dependency / manifest files ──────────────────────────────────────────────

const MANIFEST_FILES = [
    "package.json",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "pyproject.toml",
    "composer.json",
];

async function readDependencyFiles(
    repoDir: string
): Promise<{ filename: string; content: string }[]> {
    const results: { filename: string; content: string }[] = [];
    for (const filename of MANIFEST_FILES) {
        try {
            const content = await fs.readFile(
                path.join(repoDir, filename),
                "utf-8"
            );
            results.push({ filename, content });
        } catch {
            // file doesn't exist, skip
        }
    }
    return results;
}

// ── Paginated commits (for client-side "load more") ─────────────────────────

export async function readCommitsPage(
    owner: string,
    repo: string,
    branch: string,
    page: number,
    perPage: number,
): Promise<Commit[]> {
    const { git } = await getRepo(owner, repo);
    const skip = (page - 1) * perPage;

    const raw = await git.raw([
        "log", branch, "--topo-order",
        "--format=%H%x00%h%x00%s%x00%an%x00%aI%x00%P",
        `--skip=${skip}`,
        `-n`, String(perPage),
    ]);

    if (!raw.trim()) return [];

    const commits: Commit[] = [];
    for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\0");
        if (parts.length < 6) continue;

        commits.push({
            sha: parts[0].trim(),
            shortSha: parts[1].trim(),
            message: parts[2].trim(),
            authorName: parts[3].trim(),
            authorLogin: null,
            authorAvatar: null,
            date: parts[4].trim(),
            parents: parts[5].trim() ? parts[5].trim().split(" ") : [],
        });
    }

    return commits;
}

// ── Single file content (for client-side preview) ───────────────────────────

export async function readFileContent(
    owner: string,
    repo: string,
    filePath: string,
): Promise<string> {
    const { repoDir } = await getRepo(owner, repo);
    const fullPath = path.join(repoDir, filePath);

    // Ensure resolved path stays inside the repo directory
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(repoDir))) {
        throw new Error("File path not found");
    }

    try {
        return await fs.readFile(resolved, "utf-8");
    } catch {
        throw new Error("File not found");
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchAllRepoDataLocal(
    owner: string,
    repo: string,
    defaultBranch: string
): Promise<LocalGitResult> {
    const { git, repoDir } = await getRepo(owner, repo);

    // Ensure working tree is on the default branch for file reads
    await git.checkout(defaultBranch).catch(() => { /* may already be on it */ });

    const branches = await readBranches(git, defaultBranch);

    const [fileTree, commits, contributors, readme, dependencyFiles] =
        await Promise.all([
            readFileTree(git, defaultBranch).catch(() => null),
            readCommits(git).catch(() => []),
            readContributors(git).catch(() => []),
            readReadme(repoDir).catch(() => ""),
            readDependencyFiles(repoDir).catch(() => []),
        ]);

    return { fileTree, contributors, branches, commits, readme, dependencyFiles };
}
