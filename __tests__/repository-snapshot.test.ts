/** @jest-environment node */
import { NextRequest } from "next/server";
import { fetchAllRepoData } from "@/lib/github";
import { GET as getSeed } from "@/app/api/graph/seed/route";
import { GET as getRepo } from "@/app/api/github/repo/route";
import { GET as getStream } from "@/app/api/github/repo/stream/route";
import { getCachedSeed, setCachedSeed } from "@/lib/graph-cache";

const mockCacheEntries = new Map<string, unknown>();
jest.mock("next/cache", () => ({ unstable_cache: (callback: (...args: unknown[]) => Promise<unknown>, keys: string[]) => async (...args: unknown[]) => {
    const key = JSON.stringify([keys, args]);
    if (!mockCacheEntries.has(key)) mockCacheEntries.set(key, await callback(...args));
    return mockCacheEntries.get(key);
} }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (s: string) => s }));
jest.mock("@/lib/graph-cache", () => ({ getCachedSeed: jest.fn(async () => null), setCachedSeed: jest.fn(async () => {}) }));
jest.mock("graphology-layout-forceatlas2", () => ({ __esModule: true, default: () => ({ root: { x: 0, y: 0 } }) }));
const A = "a".repeat(40), B = "b".repeat(40), T = "c".repeat(40), U = "d".repeat(40), F = "e".repeat(40);
let head: string, branch: string, privateRepo: boolean, empty: boolean, commitFailure: number, refFailure: number, advance: boolean, stars: number;
let urls: URL[];
const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
const originalPool = process.env.GITHUB_TOKENS;
const snapshot = (commitSha = A, treeSha = T) => ({ schemaVersion: 1, owner: "example", repo: "repo", selectedBranch: "main", defaultBranch: "main", status: "ready", commitSha, treeSha, visibility: "public", capturedAt: "2026-10-30T12:00:00.000Z" });

beforeEach(() => {
    delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKENS;
    head = A; branch = "main"; privateRepo = false; empty = false; commitFailure = 0; refFailure = 0; advance = false; stars = 10; urls = [];
    mockCacheEntries.clear(); jest.mocked(getCachedSeed).mockReset().mockResolvedValue(null); jest.mocked(setCachedSeed).mockClear();
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input)); urls.push(url);
        const auth = new Headers(init?.headers).get("Authorization");
        if (privateRepo && auth !== "token dummy-caller") return Response.json({ message: "Not Found" }, { status: 404 });
        if (/^\/repos\/example\/[^/]+$/.test(url.pathname)) return Response.json({ private: privateRepo, full_name: "example/repo", default_branch: branch, description: "Fixture", topics: [], stargazers_count: stars, forks_count: 0, subscribers_count: 0, open_issues_count: 0, language: "TypeScript", pushed_at: "2026-10-30T00:00:00Z", html_url: "https://github.com/example/repo" });
        if (url.pathname.includes("/git/ref/")) {
            if (refFailure) return Response.json({ message: "Reference unavailable" }, { status: refFailure });
            if (empty) return Response.json({ message: "Git Repository is empty." }, { status: 409 });
            const sha = head; if (advance) head = B;
            return Response.json({ ref: `refs/heads/${branch}`, object: { type: "commit", sha } });
        }
        if (url.pathname.includes("/git/commits/")) {
            if (commitFailure) return Response.json({ message: "Commit unavailable" }, { status: commitFailure });
            const sha = url.pathname.split("/").pop()!;
            return Response.json({ sha, tree: { sha: sha === A ? T : U } });
        }
        if (url.pathname.includes("/git/trees/")) {
            const sha = url.pathname.split("/").pop();
            const old = sha === T;
            return Response.json({ sha: old ? T : U, truncated: false, tree: [{ path: old ? "old.ts" : "new.ts", sha: F, type: "blob", mode: "100644", size: 20, url: "" }] });
        }
        if (url.pathname.endsWith("/branches")) return Response.json([{ name: branch, commit: { sha: head } }, { name: "feature/正常", commit: { sha: B } }]);
        if (url.pathname.endsWith("/commits")) return Response.json([]);
        if (url.pathname.endsWith("/languages")) return Response.json({ TypeScript: 20 });
        if (url.pathname.endsWith("/readme") || url.hostname === "raw.githubusercontent.com") return new Response("Not found", { status: 404 });
        return Response.json([]);
    }) as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; if (originalToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalToken; if (originalPool === undefined) delete process.env.GITHUB_TOKENS; else process.env.GITHUB_TOKENS = originalPool; });

it("captures the branch commit then its separate tree despite the branch advancing", async () => {
    advance = true;
    const data = await fetchAllRepoData("example", "repo");
    expect(data).toMatchObject({ snapshot: { ...snapshot(), capturedAt: expect.any(String) }, fileTree: { sha: T, tree: [{ path: "old.ts", sha: F }] } });
    expect(urls.filter(url => url.pathname.includes("/git/ref/"))).toHaveLength(1);
    expect(urls.some(url => url.pathname === `/repos/example/repo/git/commits/${A}`)).toBe(true);
    expect(urls.some(url => url.pathname === `/repos/example/repo/git/trees/${T}`)).toBe(true);
    expect(urls.filter(url => url.pathname.endsWith("/commits")).map(url => url.searchParams.get("sha"))).toContain(A);
});

it("does not reuse an owner/repo-only aggregate when the captured revision changes", async () => {
    const first = await fetchAllRepoData("example", "repo"); head = B;
    const second = await fetchAllRepoData("example", "repo");
    expect(first.fileTree?.tree[0].path).toBe("old.ts"); expect(second.fileTree?.tree[0].path).toBe("new.ts");
    expect(second).toMatchObject({ snapshot: { commitSha: B, treeSha: U } });
});

it("reuses a coherent captured snapshot with its original observation time", async () => {
    const first = await fetchAllRepoData("example", "repo"); stars = 99;
    const second = await fetchAllRepoData("example", "repo");
    expect(second).toMatchObject({ snapshot: { commitSha: A, treeSha: T, capturedAt: expect.any(String) }, observations: { metadata: { status: "ready", observedAt: expect.any(String) }, contributors: { status: "ready", observedAt: expect.any(String) }, languages: { status: "ready", observedAt: expect.any(String) } } });
    expect(second).toEqual(first); expect(second.metadata.stars).toBe(10);
    expect(urls.filter(url => url.pathname.includes("/git/trees/"))).toHaveLength(1);
});

it("distinguishes different commits even when they reference the same tree", async () => {
    const fixtureFetch = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).endsWith(`/git/commits/${B}`) ? Promise.resolve(Response.json({ sha: B, tree: { sha: T } })) : fixtureFetch(input, init)) as typeof fetch;
    await fetchAllRepoData("example", "repo"); head = B;
    expect(await fetchAllRepoData("example", "repo")).toMatchObject({ snapshot: { commitSha: B, treeSha: T } });
    expect(mockCacheEntries.size).toBe(2);
});

it.each(["feature/正常", "release/v2"])("resolves the exact default branch %s without query/path escape", async name => {
    branch = name; const data = await fetchAllRepoData("example", "repo");
    expect(data).toMatchObject({ snapshot: { selectedBranch: name, defaultBranch: name, commitSha: A } });
    expect(urls.find(url => url.pathname.includes("/git/ref/"))?.pathname).toBe(`/repos/example/repo/git/ref/heads/${encodeURIComponent(name)}`);
});

it("treats a renamed default as distinct captured identity", async () => {
    await fetchAllRepoData("example", "repo"); branch = "trunk";
    expect(await fetchAllRepoData("example", "repo")).toMatchObject({ snapshot: { defaultBranch: "trunk", selectedBranch: "trunk", commitSha: A } });
    expect(mockCacheEntries.size).toBe(2);
});

it("represents a confirmed empty repository without manufacturing commit/tree SHAs", async () => {
    empty = true;
    expect(await fetchAllRepoData("example", "repo")).toMatchObject({ snapshot: { status: "empty", commitSha: null, treeSha: null, capturedAt: expect.any(String) }, fileTree: null, branches: [], commits: [] });
    expect(urls.some(url => url.pathname.includes("/git/trees/"))).toBe(false);
});
it.each([403, 404, 409, 429, 503])("does not interpret reference failure %i as empty", async status => {
    refFailure = status; await expect(fetchAllRepoData("example", "repo")).rejects.toThrow();
});
it("does not turn an inaccessible captured commit into an empty workspace", async () => {
    commitFailure = 404; await expect(fetchAllRepoData("example", "repo")).rejects.toThrow(/404/);
});
it("preserves caller isolation and rechecks access before any aggregate reuse", async () => {
    privateRepo = true;
    expect(await fetchAllRepoData("example", "repo", "dummy-caller")).toMatchObject({ snapshot: { visibility: "private", commitSha: A } });
    await expect(fetchAllRepoData("example", "repo", "dummy-revoked")).rejects.toThrow();
    expect(mockCacheEntries.size).toBe(0);
    expect(JSON.stringify(await fetchAllRepoData("example", "repo", "dummy-caller"))).not.toContain("dummy-caller");
});
it("records branch-specific head identities separately from the code snapshot", async () => {
    const data = await fetchAllRepoData("example", "repo");
    expect(data.branches).toEqual(expect.arrayContaining([expect.objectContaining({ name: "main", sha: A, headSha: A, capturedAt: expect.any(String) }), expect.objectContaining({ name: "feature/正常", headSha: B })]));
});

it.each([getRepo, getStream])("propagates snapshot identity through the existing aggregate transport", async handler => {
    const response = await handler(new NextRequest("http://localhost/api/test?owner=example&repo=repo"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.text(); expect(body).toContain('"commitSha":"'+A+'"'); expect(body).toContain('"treeSha":"'+T+'"');
});

it("seeds the requested displayed snapshot without resolving the new branch HEAD", async () => {
    head = B;
    const response = await getSeed(new NextRequest("http://localhost/api/graph/seed?"+new URLSearchParams({ owner: "example", repo: "repo", snapshot: JSON.stringify(snapshot()) })));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ snapshot: snapshot(), positions: { root: [0, 0] } });
    expect(urls.some(url => url.pathname.includes("/git/ref/"))).toBe(false);
    expect(urls.some(url => url.pathname === `/repos/example/repo/git/trees/${T}`)).toBe(true);
    expect(getCachedSeed).toHaveBeenCalledWith(expect.stringContaining(A));
    expect(setCachedSeed).toHaveBeenCalledWith(expect.stringContaining(T), expect.any(Object), expect.any(Number));
});
it.each([{ ...snapshot(), treeSha: U }, { ...snapshot(), commitSha: "short" }, { ...snapshot(), owner: "other" }])("rejects forged/mismatched seed identity", async value => {
    const response = await getSeed(new NextRequest("http://localhost/api/graph/seed?"+new URLSearchParams({ owner: "example", repo: "repo", snapshot: JSON.stringify(value) })));
    expect(response.status).toBeGreaterThanOrEqual(400); expect(setCachedSeed).not.toHaveBeenCalled(); expect(getCachedSeed).not.toHaveBeenCalled();
});
it("never treats a public browser snapshot as private authorization, even on a seed cache hit", async () => {
    privateRepo = true; jest.mocked(getCachedSeed).mockResolvedValue({ root: [0, 0] });
    const response = await getSeed(new NextRequest("http://localhost/api/graph/seed?"+new URLSearchParams({ owner: "example", repo: "repo", snapshot: JSON.stringify(snapshot()) })));
    expect(response.status).toBeGreaterThanOrEqual(400); expect(getCachedSeed).not.toHaveBeenCalled();
});

it("fails closed when repository visibility is missing, including caller-authenticated reads", async () => {
    const fixtureFetch = global.fetch;
    global.fetch = jest.fn((input, init) => /^https:\/\/api.github.com\/repos\/example\/repo$/.test(String(input)) ? Promise.resolve(Response.json({ default_branch: "main" })) : fixtureFetch(input, init)) as typeof fetch;
    await expect(fetchAllRepoData("example", "repo", "dummy-caller")).rejects.toThrow();
});
it("rejects a visibility change between the initial gate and fresh metadata before operator reads", async () => {
    process.env.GITHUB_TOKEN = "dummy-operator"; const fixtureFetch = global.fetch; let metadataReads = 0;
    global.fetch = jest.fn((input, init) => String(input) === "https://api.github.com/repos/example/repo" && ++metadataReads > 1 ? Promise.resolve(Response.json({ private: true, default_branch: "main" })) : fixtureFetch(input, init)) as typeof fetch;
    await expect(fetchAllRepoData("example", "repo")).rejects.toThrow();
    expect(urls.some(url => url.pathname.includes("/git/"))).toBe(false);
});
it("records failed live-statistic observations separately from a usable tree", async () => {
    const fixtureFetch = global.fetch;
    global.fetch = jest.fn((input, init) => /\/(contributors|languages)(\?|$)/.test(String(input)) ? Promise.resolve(new Response("Unavailable", { status: 503 })) : fixtureFetch(input, init)) as typeof fetch;
    const expectedWarning = jest.spyOn(console, "warn").mockImplementation(() => {});
    try { expect(await fetchAllRepoData("example", "repo")).toMatchObject({ snapshot: { commitSha: A }, observations: { contributors: { status: "error", observedAt: expect.any(String) }, languages: { status: "error", observedAt: expect.any(String) } } }); }
    finally { expectedWarning.mockRestore(); }
});
it("keeps private seed layouts out of shared storage", async () => {
    privateRepo = true;
    const value = { ...snapshot(), visibility: "private" };
    const response = await getSeed(new NextRequest("http://localhost/api/graph/seed?"+new URLSearchParams({ owner: "example", repo: "repo", snapshot: JSON.stringify(value) }), { headers: { "x-github-token": "dummy-caller" } }));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(getCachedSeed).not.toHaveBeenCalled(); expect(setCachedSeed).not.toHaveBeenCalled();
});
