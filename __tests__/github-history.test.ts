/** @jest-environment node */
import { NextRequest } from "next/server";
import { fetchAllRepoData } from "@/lib/github";
import { GET } from "@/app/api/github/repo/commits/route";
import { GET as getRepository } from "@/app/api/github/repo/route";
import { GET as getStream } from "@/app/api/github/repo/stream/route";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "fixture", scrubSecrets: (value: string) => value }));
const A = "a".repeat(40), F = "b".repeat(40), T = "c".repeat(40);
const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
const originalPool = process.env.GITHUB_TOKENS;
const apiCommit = (sha: string, message: string) => ({ sha, commit: { message, author: { name: "Fixture", date: "2026-11-07T00:00:00Z" } }, author: null, parents: [{ sha: "d".repeat(40) }] });
const defaultPage = (page: number) => Array.from({ length: 100 }, (_, i) => apiCommit(page === 1 && i === 0 ? A : (page * 100 + i).toString(16).padStart(40, "0"), `main-${page}-${i}`));
let failures: Set<number>, link: string | undefined, privateRepo: boolean, denied: boolean;
let calls: Array<{ url: URL; init?: RequestInit }>;
beforeEach(() => {
    delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKENS;
    failures = new Set(); link = undefined; privateRepo = false; denied = false; calls = [];
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input)); calls.push({ url, init });
        if (url.pathname === "/repos/example/history") return Response.json({ id: 123, private: privateRepo, full_name: "example/history", default_branch: "main", topics: [] });
        if (url.pathname.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha: A } });
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: A, tree: { sha: T } });
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: T, tree: [] });
        if (url.pathname.endsWith("/branches")) return Response.json([{ name: "feature/正常", commit: { sha: F } }]);
        if (/\/commits$/.test(url.pathname)) {
            const page = Number(url.searchParams.get("page")), head = url.searchParams.get("sha");
            if (denied) return new Response("Forbidden", { status: 403 });
            if (failures.has(page) && head === A) return new Response("Unavailable", { status: 503 });
            const data = head === F ? [apiCommit(F, "FEATURE_ONLY"), defaultPage(1)[0]] : page <= 5 ? defaultPage(page) : [];
            const next = link ?? (head === A && page < 6 ? `<https://api.github.com/repositories/123/commits?sha=${A}&page=${page + 1}&per_page=100>; rel="next"` : "");
            return Response.json(data, { headers: next ? { Link: next } : {} });
        }
        if (url.pathname.endsWith("/readme") || url.pathname.includes("/contents/")) return new Response("Not found", { status: 404 });
        return Response.json([]);
    }) as typeof fetch;
});
afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalToken;
    if (originalPool === undefined) delete process.env.GITHUB_TOKENS; else process.env.GITHUB_TOKENS = originalPool;
});
const request = (params: Record<string, string> = {}, token?: string, signal?: AbortSignal) => GET(new NextRequest("http://localhost/api/commits?" + new URLSearchParams({ owner: "example", repo: "history", sha: A, page: "1", per_page: "100", ...params }), { headers: token ? { "x-github-token": token } : {}, signal }));

it("keeps feature-only commits in the graph and its own history, not default history, even when default is absent from the listing", async () => {
    const data = await fetchAllRepoData("example", "history");
    expect(data.graphCommits).toHaveLength(501);
    expect(data.graphCommits.find(commit => commit.sha === F)?.parents).toEqual(["d".repeat(40)]);
    expect(data.defaultHistory).toMatchObject({ branch: "main", headSha: A, nextPage: 6, complete: false });
    const pages = Object.values(data.defaultHistory.pages);
    const main = pages.flatMap(page => page.status === "ready" ? page.commits : []);
    expect(main).toHaveLength(500); expect(main.some(commit => commit.sha === F)).toBe(false);
    const feature = data.branchHistories["feature/正常"].pages[1];
    expect(feature.status === "ready" ? feature.commits.map(commit => commit.sha) : []).toEqual([F, A]);
    expect(data.graphCommits.filter(commit => commit.sha === A)).toHaveLength(1);
});
it("retains pages 3–5 after page 2 fails and identifies that earliest gap for retry", async () => {
    failures.add(2);
    const data = await fetchAllRepoData("example", "history");
    expect(data.defaultHistory).toMatchObject({ headSha: A, nextPage: 2, complete: false, error: { status: 503 } });
    expect(data.defaultHistory.pages[2]).toMatchObject({ status: "error" });
    expect(data.defaultHistory.pages[5]).toMatchObject({ status: "ready", commits: expect.any(Array) });
    failures.clear(); const response = await request({ page: "2" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ headSha: A, page: 2, nextPage: 3, commits: expect.any(Array) });
});
it("returns only safe continuation from a legitimate canonical repository-ID link", async () => {
    const response = await request();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data = await response.json(); expect(data).toMatchObject({ headSha: A, page: 1, perPage: 100, nextPage: 2 });
    expect(JSON.stringify(data)).not.toContain("https://api.github.com");
    expect(calls.filter(call => /\/commits$/.test(call.url.pathname))).toHaveLength(1);
    expect(calls.find(call => /\/commits$/.test(call.url.pathname))?.url.pathname).toBe("/repositories/123/commits");
});
it.each([
    `https://evil.invalid/repos/example/history/commits?sha=${A}&page=2&per_page=100`,
    `http://api.github.com/repos/example/history/commits?sha=${A}&page=2&per_page=100`,
    `https://api.github.com/repositories/999/commits?sha=${A}&page=2&per_page=100`,
    `https://api.github.com/repos/other/history/commits?sha=${A}&page=2&per_page=100`,
    `https://api.github.com/repos/example/history/commits?sha=${F}&page=2&per_page=100`,
    `https://api.github.com/repos/example/history/commits?sha=${A}&page=4&per_page=100`,
    `https://api.github.com/repos/example/history/commits?sha=${A}&page=2&per_page=500`,
])("rejects untrusted GitHub continuation %s before any follow-up request", async url => {
    link = `<${url}>; rel="next"`;
    const response = await request({}, "dummy-caller");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(calls.filter(call => /\/commits$/.test(call.url.pathname))).toHaveLength(1);
    expect(calls.every(call => call.url.hostname === "api.github.com")).toBe(true);
});
it.each([["sha", "main"], ["page", "NaN"], ["page", "0"], ["page", "51"], ["per_page", "101"], ["page", "2oops"]])("rejects untrusted pagination input %s=%s before credentialed requests", async (field, value) => {
    expect((await request({ [field]: value }, "dummy-caller")).status).toBe(400); expect(calls).toHaveLength(0);
});
it("distinguishes inaccessible private history from successful empty completion and never caches caller reads", async () => {
    privateRepo = true; denied = true;
    expect((await request({}, "dummy-caller")).status).toBe(403);
    expect(calls.every(call => new Headers(call.init?.headers).get("Authorization") === "token dummy-caller" && call.init?.cache === "no-store" && call.init?.next?.revalidate === undefined)).toBe(true);
    denied = false; const response = await request({ page: "6" }, "dummy-caller");
    expect(await response.json()).toMatchObject({ headSha: A, page: 6, commits: [], nextPage: null });
});
it("propagates request cancellation even when fetch ignores abort", async () => {
    const controller = new AbortController(), fixture = global.fetch;
    global.fetch = jest.fn((input, init) => { if (/\/commits\?/.test(String(input))) controller.abort(); return fixture(input, init); }) as typeof fetch;
    expect((await request({}, undefined, controller.signal)).status).toBe(499);
});
it("keeps subsequent pages at the captured commit after the branch advances", async () => {
    await request(); const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/git/ref/") ? Promise.resolve(Response.json({ object: { type: "commit", sha: F } })) : fixture(input, init)) as typeof fetch;
    const response = await request({ page: "2" });
    expect(await response.json()).toMatchObject({ headSha: A, page: 2, nextPage: 3 });
    expect(calls.filter(call => /\/commits$/.test(call.url.pathname)).every(call => call.url.searchParams.get("sha") === A)).toBe(true);
    expect(calls.some(call => call.url.pathname.includes("/git/ref/"))).toBe(false);
});
it("uses an authoritative next link even when a page is shorter than per_page", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => /\/commits\?/.test(String(input)) ? Promise.resolve(Response.json(defaultPage(1).slice(0, 2), { headers: { Link: `<https://api.github.com/repositories/123/commits?sha=${A}&page=2&per_page=100>; rel="next"` } })) : fixture(input, init)) as typeof fetch;
    expect(await (await request()).json()).toMatchObject({ nextPage: 2, commits: expect.any(Array) });
});
it("reports quota errors and Retry-After without anonymous retries or false completion", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => /\/commits\?/.test(String(input)) ? Promise.resolve(new Response("Quota exhausted", { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "60" } })) : fixture(input, init)) as typeof fetch;
    const response = await request({}, "dummy-caller");
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("60");
    expect(jest.mocked(global.fetch).mock.calls).toHaveLength(2);
    expect((await response.json()).error).toMatch(/rate limit/);
});
it("rejects caller-supplied URLs and repository IDs instead of treating them as capabilities", async () => {
    expect((await request({ next: "https://evil.invalid/data" }, "dummy-caller")).status).toBe(400);
    expect((await request({ repositoryId: "999" }, "dummy-caller")).status).toBe(400);
    expect(calls).toHaveLength(0);
});
it.each([getRepository, getStream])("carries independent graph/history data through the actual aggregate transport", async handler => {
    const response = await handler(new NextRequest("http://localhost/api/repo?owner=example&repo=history"));
    const text = await response.text();
    const data = response.headers.get("Content-Type")?.includes("event-stream") ? text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).find(event => event.type === "done").payload : JSON.parse(text);
    expect(data.graphCommits).toHaveLength(501);
    expect(data.defaultHistory).toMatchObject({ branch: "main", headSha: A, nextPage: 6 });
    expect(data.branchHistories["feature/正常"].headSha).toBe(F);
});
