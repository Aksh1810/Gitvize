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
    LanguageStats,
} from "@/types";

// ── Config ───────────────────────────────────────────────────────────────────

const CLONE_BASE = "/tmp/gitviz-repos";
// No hard timeout on clone — large repos can take many minutes.
// Individual read operations use a 30-second block timeout via simpleGit(repoDir, { timeout }).
const MAX_COMMITS = 500;

// How long a clone is considered fresh before we re-fetch (5 minutes)
const FETCH_COOLDOWN_MS = 5 * 60 * 1000;
const lastFetchedAt = new Map<string, number>();

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
    languages: LanguageStats;
}

// ── Language inference from file extensions ───────────────────────────────────
// Maps extension → language name (matches GitHub's language names)

const EXT_LANGUAGE: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript",
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    java: "Java",
    kt: "Kotlin", kts: "Kotlin",
    swift: "Swift",
    cs: "C#",
    cpp: "C++", cc: "C++", cxx: "C++", hxx: "C++",
    c: "C", h: "C",
    php: "PHP",
    html: "HTML", htm: "HTML",
    css: "CSS",
    scss: "SCSS", sass: "SCSS",
    vue: "Vue",
    svelte: "Svelte",
    dart: "Dart",
    ex: "Elixir", exs: "Elixir",
    hs: "Haskell",
    lua: "Lua",
    r: "R",
    scala: "Scala",
    clj: "Clojure", cljs: "Clojure",
    sh: "Shell", bash: "Shell", zsh: "Shell",
    ps1: "PowerShell",
    md: "Markdown", mdx: "Markdown",
    json: "JSON",
    yaml: "YAML", yml: "YAML",
    toml: "TOML",
    xml: "XML",
    sql: "SQL",
};

export function inferLanguages(tree: TreeItem[]): LanguageStats {
    const counts: Record<string, number> = {};
    for (const item of tree) {
        if (item.type !== "blob") continue;
        const ext = item.path.split(".").pop()?.toLowerCase() ?? "";
        const lang = EXT_LANGUAGE[ext];
        if (!lang) continue;
        counts[lang] = (counts[lang] ?? 0) + (item.size ?? 1);
    }
    return counts;
}

// ── Core: clone or fetch ─────────────────────────────────────────────────────

export async function cloneRepo(
    owner: string,
    repo: string,
    token?: string | null,
    onProgress?: (msg: string) => void,
): Promise<{ git: SimpleGit; repoDir: string }> {
    const repoDir = path.join(CLONE_BASE, owner, repo);
    const key = `${owner}/${repo}`;

    // Wait for any in-flight clone of the same repo
    const pending = cloneLocks.get(key);
    if (pending) {
        onProgress?.("Waiting for in-progress clone...");
        await pending;
    }

    const gitDir = path.join(repoDir, ".git");
    let needsClone = false;
    try {
        await fs.access(gitDir);
        // A real clone has a config file with [remote "origin"].
        // If the config is missing or has no remote, treat as corrupt and re-clone.
        const configPath = path.join(gitDir, "config");
        const config = await fs.readFile(configPath, "utf-8").catch(() => "");
        if (!config.includes('[remote "origin"]')) needsClone = true;
    } catch {
        needsClone = true;
    }

    if (needsClone) {
        onProgress?.("Cloning repository...");
        const clonePromise = (async () => {
            // Wipe any corrupt/partial directory before re-cloning.
            await fs.rm(repoDir, { recursive: true, force: true });
            await fs.mkdir(path.join(CLONE_BASE, owner), { recursive: true });
            // Include token in URL for private repo access
            const url = token
                ? `https://${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`
                : `https://github.com/${owner}/${repo}.git`;
            // No timeout on the clone instance — large repos can take many minutes.
            // --filter=blob:none: skip downloading blobs during clone (fetched lazily
            //   on checkout), dramatically reducing clone size and time for large repos.
            // --no-single-branch: fetch all branch refs (needed for branch graph).
            await simpleGit().clone(url, repoDir, [
                "--filter=blob:none",
                "--no-single-branch",
            ]);
        })();
        cloneLocks.set(key, clonePromise);
        try {
            await clonePromise;
        } finally {
            cloneLocks.delete(key);
        }
        lastFetchedAt.set(key, Date.now());
    } else {
        const last = lastFetchedAt.get(key) ?? 0;
        if (Date.now() - last > FETCH_COOLDOWN_MS) {
            onProgress?.("Updating repository...");
            const git = simpleGit(repoDir, { timeout: { block: 30_000 } });
            await git.fetch(["--all", "--prune", "--filter=blob:none"]).catch(() => {});
            lastFetchedAt.set(key, Date.now());
        }
    }

    const git = simpleGit(repoDir, { timeout: { block: 30_000 } });
    return { git, repoDir };
}

// Keep internal alias for backward compat
async function getRepo(owner: string, repo: string, token?: string | null) {
    return cloneRepo(owner, repo, token);
}

// ── Detect default branch from remote ────────────────────────────────────────

export async function detectDefaultBranch(
    owner: string,
    repo: string,
    token?: string | null,
): Promise<string> {
    const { git } = await getRepo(owner, repo, token);
    try {
        const raw = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
        // refs/remotes/origin/HEAD → refs/remotes/origin/main → main
        const match = raw.trim().match(/refs\/remotes\/origin\/(.+)$/);
        if (match) return match[1];
    } catch { /* fall through */ }

    // Fallback: try common names
    for (const candidate of ["main", "master", "develop", "trunk"]) {
        try {
            await git.raw(["rev-parse", "--verify", `origin/${candidate}`]);
            return candidate;
        } catch { /* try next */ }
    }
    return "main";
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

        if (name.startsWith("origin/")) name = name.slice(7);
        if (name === "HEAD") continue;
        if (seen.has(name)) continue;
        seen.add(name);

        branches.push({ name, sha, isDefault: name === defaultBranch });
    }

    return branches;
}

// ── Commits (with parents for DAG) ───────────────────────────────────────────

function parseCommitLines(raw: string): Commit[] {
    const commits: Commit[] = [];
    const seen = new Set<string>();
    for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\0");
        if (parts.length < 6) continue;
        const sha = parts[0].trim();
        if (!sha || seen.has(sha)) continue;
        seen.add(sha);
        commits.push({
            sha,
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

async function readCommits(git: SimpleGit): Promise<Commit[]> {
    const raw = await git.raw([
        "log", "--all", "--topo-order",
        "--format=%H%x00%h%x00%s%x00%an%x00%aI%x00%P",
        "-n", String(MAX_COMMITS),
    ]);
    return parseCommitLines(raw).sort(
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
        const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\s+(\d+|-)\t(.+)$/);
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

    const rootSha = (await git.raw(["rev-parse", `${defaultBranch}^{tree}`])).trim();
    return { sha: rootSha, tree, truncated: false };
}

// ── Contributors ─────────────────────────────────────────────────────────────

async function readContributors(git: SimpleGit): Promise<Contributor[]> {
    const raw = await git.raw(["shortlog", "-sne", "--all"]);
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
            if (name.length > existing.name.length) existing.name = name;
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
    return contributors.sort((a, b) => b.contributions - a.contributions).slice(0, 30);
}

// ── README ───────────────────────────────────────────────────────────────────

async function readReadme(repoDir: string): Promise<string> {
    for (const name of ["README.md", "readme.md", "Readme.md", "README", "README.txt", "README.rst"]) {
        try {
            return await fs.readFile(path.join(repoDir, name), "utf-8");
        } catch { /* try next */ }
    }
    return "";
}

// ── Dependency / manifest files ──────────────────────────────────────────────

const MANIFEST_FILES = [
    "package.json", "requirements.txt", "go.mod", "Cargo.toml",
    "Gemfile", "pom.xml", "build.gradle", "pyproject.toml", "composer.json",
];

async function readDependencyFiles(repoDir: string): Promise<{ filename: string; content: string }[]> {
    const results: { filename: string; content: string }[] = [];
    await Promise.all(
        MANIFEST_FILES.map(async (filename) => {
            try {
                const content = await fs.readFile(path.join(repoDir, filename), "utf-8");
                results.push({ filename, content });
            } catch { /* not present */ }
        })
    );
    return results;
}

// ── Paginated commits ────────────────────────────────────────────────────────

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
        "-n", String(perPage),
    ]);
    return raw.trim() ? parseCommitLines(raw) : [];
}

// ── Single file content ───────────────────────────────────────────────────────

const MAX_FILE_BYTES = 500 * 1024; // 500 KB

export async function readFileContent(
    owner: string,
    repo: string,
    filePath: string,
): Promise<string> {
    const { repoDir } = await getRepo(owner, repo);
    const resolved = path.resolve(repoDir, filePath);
    if (!resolved.startsWith(path.resolve(repoDir))) throw new Error("File path not found");
    try {
        const stat = await fs.stat(resolved);
        if (stat.size > MAX_FILE_BYTES) throw new Error("File too large");
        return await fs.readFile(resolved, "utf-8");
    } catch (e) {
        throw e instanceof Error ? e : new Error("File not found");
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchAllRepoDataLocal(
    owner: string,
    repo: string,
    defaultBranch: string,
    token?: string | null,
    onProgress?: (msg: string) => void,
): Promise<LocalGitResult> {
    const { git, repoDir } = await cloneRepo(owner, repo, token, onProgress);

    await git.checkout(defaultBranch).catch(() => {});

    // Resolve the ref that actually has commits. Local branches can be in an
    // orphan/corrupt state after a partial clone or fetch; remote tracking refs
    // are always reliable after a successful clone.
    const localRefValid = await git.raw(["rev-parse", "--verify", defaultBranch])
        .then(() => true).catch(() => false);
    const treeRef = localRefValid ? defaultBranch : `origin/${defaultBranch}`;

    onProgress?.("Reading branches...");
    const branches = await readBranches(git, defaultBranch);

    onProgress?.("Reading file tree...");
    const fileTree = await readFileTree(git, treeRef).catch(() => null);

    onProgress?.("Reading commits...");
    const commits = await readCommits(git).catch(() => [] as Commit[]);

    onProgress?.("Reading contributors...");
    const contributors = await readContributors(git).catch(() => [] as Contributor[]);

    onProgress?.("Reading files...");
    const [readme, dependencyFiles] = await Promise.all([
        readReadme(repoDir).catch(() => ""),
        readDependencyFiles(repoDir).catch(() => []),
    ]);

    const languages = fileTree ? inferLanguages(fileTree.tree) : {};

    return { fileTree, contributors, branches, commits, readme, dependencyFiles, languages };
}
