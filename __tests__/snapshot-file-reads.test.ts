/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "@/app/api/github/repo/file/route";
import { POST } from "@/app/api/github/repo/files/route";
import { authorizeRepositoryRead, readFileAtSnapshot, fetchReadme, fetchDependencyFiles, fetchAllRepoData } from "@/lib/github";
import type { RepositorySnapshot } from "@/types";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "fixture", scrubSecrets: (value: string) => value }));
const A = "a".repeat(40), B = "b".repeat(40), T = "c".repeat(40), U = "f".repeat(40);
const snapshot = (repo: string, visibility: "public" | "private" = "public", commitSha = A): Extract<RepositorySnapshot, { status: "ready" }> => ({ schemaVersion: 1, owner: "example", repo, selectedBranch: "main", defaultBranch: "main", status: "ready", commitSha, treeSha: commitSha === B ? U : T, visibility, capturedAt: "2026-11-07T12:00:00.000Z" });
const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
const originalPool = process.env.GITHUB_TOKENS;
let privateRepo: boolean, denial: number, inline: boolean;
let calls: Array<{ url: URL; init?: RequestInit }>;
beforeEach(() => {
    delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKENS;
    privateRepo = false; denial = 0; inline = true; calls = [];
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input)); calls.push({ url, init });
        if (/^\/repos\/example\/[^/]+$/.test(url.pathname)) return Response.json({ private: privateRepo, full_name: "example/repo", default_branch: "main", topics: [] });
        if (url.pathname.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha: A } });
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: url.pathname.split("/").pop(), tree: { sha: url.pathname.endsWith(B) ? U : T } });
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: T, tree: [], truncated: false });
        if (url.pathname.includes("/contents/") || url.pathname.endsWith("/readme")) {
            if (denial) return Response.json({ message: "Contents unavailable" }, { status: denial });
            const text = url.searchParams.get("ref") === A ? "revision-a" : url.searchParams.get("ref") === B ? "revision-b" : "moving-head";
            if (new Headers(init?.headers).get("Accept")?.includes("raw")) return new Response(text);
            return Response.json({ type: "file", path: url.pathname.endsWith("/readme") ? "README.md" : decodeURIComponent(url.pathname.split("/contents/")[1]), sha: "d".repeat(40), size: text.length, encoding: inline ? "base64" : "none", content: inline ? Buffer.from(text).toString("base64") : "", download_url: "https://untrusted.invalid/leak" });
        }
        if (url.hostname !== "api.github.com") return new Response("untrusted-download");
        return Response.json([]);
    }) as typeof fetch;
});
afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalToken;
    if (originalPool === undefined) delete process.env.GITHUB_TOKENS; else process.env.GITHUB_TOKENS = originalPool;
});
const file = (value: RepositorySnapshot, path = "src/café #?.ts", token?: string) => GET(new NextRequest("http://localhost/api/file?" + new URLSearchParams({ owner: value.owner, repo: value.repo, path, snapshot: JSON.stringify(value) }), { headers: token ? { "x-github-token": token } : {} }));
const batch = (value: RepositorySnapshot, paths: string[], token?: string, signal?: AbortSignal) => POST(new NextRequest("http://localhost/api/files", { method: "POST", body: JSON.stringify({ owner: value.owner, repo: value.repo, snapshot: value, paths }), headers: token ? { "x-github-token": token } : {}, signal }));

it("reads the captured commit after the branch advances and separates the same path at two revisions", async () => {
    const value = snapshot("advance");
    expect(await (await file(value)).text()).toBe("revision-a");
    expect(await (await file(snapshot("advance", "public", B))).text()).toBe("revision-b");
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))[0].url.pathname).toBe("/repos/example/advance/contents/src/caf%C3%A9%20%23%3F.ts");
});
it("keeps distinct commit identity even when tree and file bytes are identical", async () => {
    const first = snapshot("identical-tree"), second = { ...first, commitSha: B }, fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes(`/git/commits/${B}`) ? Promise.resolve(Response.json({ sha: B, tree: { sha: T } })) : String(input).includes("/contents/") && new URL(String(input)).searchParams.get("ref") === B ? Promise.resolve(Response.json({ type: "file", encoding: "base64", content: Buffer.from("revision-a").toString("base64") })) : fixture(input, init)) as typeof fetch;
    expect(await (await file(first, "a.ts")).text()).toBe("revision-a");
    expect(await (await file(second, "a.ts")).text()).toBe("revision-a");
    expect(jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/contents/")).map(([url]) => new URL(String(url)).searchParams.get("ref"))).toEqual([A, B]);
});
it("warms 50 public files with one fresh visibility check and zero repeated content downloads", async () => {
    const value = snapshot("warm-50"), paths = Array.from({ length: 50 }, (_, i) => `${i}.ts`);
    expect((await (await batch(value, paths)).json()).files).toHaveLength(50);
    calls = [];
    expect((await (await batch(value, paths)).json()).files).toHaveLength(50);
    expect(calls.filter(c => /^\/repos\/example\/[^/]+$/.test(c.url.pathname))).toHaveLength(1);
    expect(calls.filter(c => c.url.pathname.includes("/git/commits/"))).toHaveLength(1);
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))).toHaveLength(0);
});
it("honors a fresh private Contents denial even while the same credential can still read metadata", async () => {
    privateRepo = true; const value = snapshot("revoked-contents", "private");
    expect((await file(value, "a.ts", "dummy-caller")).status).toBe(200);
    denial = 403; calls = [];
    expect((await file(value, "a.ts", "dummy-caller")).status).toBe(403);
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))).toHaveLength(1);
    expect(calls.every(c => new Headers(c.init?.headers).get("Authorization") === "token dummy-caller")).toBe(true);
});
it.each([401, 403, 404, 429])("preserves Contents HTTP %i without raw or anonymous retries", async status => {
    denial = status;
    expect((await file(snapshot(`failure-${status}`))).status).toBe(status);
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))).toHaveLength(1);
    expect(calls.some(c => c.url.hostname !== "api.github.com")).toBe(false);
});
it("uses the same pinned Contents URL, credential and raw media type instead of an expiring download URL", async () => {
    inline = false; privateRepo = true;
    expect(await (await file(snapshot("raw", "private"), "a.ts", "dummy-caller")).text()).toBe("revision-a");
    const reads = calls.filter(c => c.url.pathname.includes("/contents/"));
    expect(reads).toHaveLength(2);
    expect(reads.map(c => c.url.href)).toEqual(Array(2).fill(`https://api.github.com/repos/example/raw/contents/a.ts?ref=${A}`));
    expect(reads.every(c => new Headers(c.init?.headers).get("Authorization") === "token dummy-caller")).toBe(true);
    expect(new Headers(reads[1].init?.headers).get("Accept")).toContain("raw");
    expect(calls.some(c => c.url.hostname === "untrusted.invalid")).toBe(false);
});
it("blocks a warmed public source after visibility changes to private", async () => {
    const value = snapshot("visibility"); await file(value, "a.ts"); privateRepo = true; calls = [];
    expect((await file(value, "a.ts")).status).toBe(404);
    expect(calls).toHaveLength(1);
});
it("rejects an unpinned file request instead of reading HEAD", async () => {
    expect((await GET(new NextRequest("http://localhost/api/file?owner=example&repo=repo&path=a.ts"))).status).toBe(400);
    expect(calls).toHaveLength(0);
});
it("pins README/manifests and gives every caller-authenticated GitHub read no-store without positive revalidation", async () => {
    privateRepo = true;
    const data = await fetchAllRepoData("example", "aggregate", "dummy-caller");
    expect(data.readme).toBe("revision-a");
    expect(data.dependencyFiles.map(f => f.content)).toEqual(Array(8).fill("revision-a"));
    for (const call of calls) {
        expect(call.init?.cache).toBe("no-store"); expect(call.init?.next?.revalidate).toBeUndefined();
        if (call.url.pathname.includes("/contents/") || call.url.pathname.endsWith("/readme")) expect(call.url.searchParams.get("ref")).toBe(A);
    }
});
it("does not persist caller-private metadata, refs, trees, commits, statistics or content through Next fetch caching", async () => {
    privateRepo = true; await fetchAllRepoData("example", "private-fetch-options", "dummy-caller");
    for (const call of calls) { expect(call.init?.cache).toBe("no-store"); expect(call.init?.next?.revalidate).toBeUndefined(); }
});
it("deduplicates only within an issued private request context and rejects forged handles", async () => {
    privateRepo = true; const value = snapshot("local-dedup", "private");
    const context = await authorizeRepositoryRead("example", value.repo, "dummy-caller");
    expect(JSON.stringify(context)).toBe("{}");
    expect(await Promise.all([readFileAtSnapshot(context, value, "a.ts"), readFileAtSnapshot(context, value, "a.ts")])).toEqual(["revision-a", "revision-a"]);
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))).toHaveLength(1);
    await expect(readFileAtSnapshot(JSON.parse(JSON.stringify(context)), value, "a.ts")).rejects.toThrow(/snapshot/i);
    denial = 403;
    const nextContext = await authorizeRepositoryRead("example", value.repo, "dummy-caller");
    await expect(readFileAtSnapshot(nextContext, value, "a.ts")).rejects.toMatchObject({ status: 403 });
});
it("preserves successful empty files alongside truthful private permission failures", async () => {
    privateRepo = true; const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/empty.ts") ? Promise.resolve(Response.json({ type: "file", encoding: "base64", content: "" })) : String(input).includes("/contents/denied.ts") ? Promise.resolve(new Response("Forbidden", { status: 403 })) : fixture(input, init)) as typeof fetch;
    const response = await batch(snapshot("partial", "private"), ["empty.ts", "denied.ts", "empty.ts"], "dummy-caller");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ files: [{ path: "empty.ts", content: "" }], errors: [{ path: "denied.ts", status: 403 }] });
});
it("counts serialized escaping rather than character length toward the 2 MiB response limit", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/") ? Promise.resolve(Response.json({ type: "file", encoding: "base64", content: Buffer.from("\u0000".repeat(200 * 1024)).toString("base64") })) : fixture(input, init)) as typeof fetch;
    expect((await batch(snapshot("escaping"), ["a.ts", "b.ts"])).status).toBe(413);
});
it("enforces the source byte limit for multibyte text", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/") ? Promise.resolve(Response.json({ type: "file", encoding: "base64", content: Buffer.from("🚀".repeat(131073)).toString("base64") })) : fixture(input, init)) as typeof fetch;
    expect((await file(snapshot("multibyte"), "a.ts")).status).toBe(413);
});
it("aborts a server batch even if the upstream ignores abort and does not cache its late bytes", async () => {
    const value = snapshot("abort"), controller = new AbortController(), fixture = global.fetch;
    global.fetch = jest.fn((input, init) => { if (String(input).includes("/contents/")) controller.abort(); return fixture(input, init); }) as typeof fetch;
    expect((await batch(value, Array.from({ length: 12 }, (_, i) => `${i}.ts`), undefined, controller.signal)).status).toBe(499);
    expect(calls.filter(c => c.url.pathname.includes("/contents/")).length).toBeLessThanOrEqual(4);
    calls = []; global.fetch = fixture;
    expect((await batch(value, ["0.ts"])).status).toBe(200);
    expect(calls.filter(c => c.url.pathname.includes("/contents/"))).toHaveLength(1);
});
it("rejects cancellation before authorizing or reading a source", async () => {
    const controller = new AbortController(); controller.abort();
    expect((await batch(snapshot("already-aborted"), ["a.ts"], undefined, controller.signal)).status).toBe(499);
    expect(calls).toHaveLength(0);
});
it("keeps auth/quota errors distinct when every file in a batch fails", async () => {
    denial = 429;
    const response = await batch(snapshot("quota-batch"), ["a.ts", "b.ts"]);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ files: [], errors: [{ path: "a.ts", status: 429 }, { path: "b.ts", status: 429 }] });
});
it("does not turn malformed base64 into a successful empty file", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/") ? Promise.resolve(Response.json({ type: "file", encoding: "base64", content: "$$invalid$$" })) : fixture(input, init)) as typeof fetch;
    expect((await file(snapshot("invalid-base64"), "a.ts")).status).toBeGreaterThanOrEqual(400);
});
it("bounds concurrent aggregate README/manifest reads to four", async () => {
    let active = 0, peak = 0; const fixture = global.fetch;
    global.fetch = jest.fn(async (input, init) => {
        if (!/\/(contents\/|readme)/.test(String(input))) return fixture(input, init);
        active++; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 1));
        try { return await fixture(input, init); } finally { active--; }
    }) as typeof fetch;
    await fetchAllRepoData("example", "read-concurrency");
    expect(peak).toBeLessThanOrEqual(4);
});
it("keeps successful pinned manifests and reports ordinary partial failures", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/package.json") ? Promise.resolve(new Response("Unavailable", { status: 503 })) : fixture(input, init)) as typeof fetch;
    const data = await fetchAllRepoData("example", "partial-manifests");
    expect(data.dependencyFiles).toHaveLength(7);
    expect(data.dependencyFilesFetchError).toEqual(expect.any(String));
});
it("does not serve warm public content after the repository becomes inaccessible", async () => {
    const value = snapshot("inaccessible"); await file(value, "a.ts"); calls = [];
    global.fetch = jest.fn(async () => new Response("Not found", { status: 404 })) as typeof fetch;
    expect((await file(value, "a.ts")).status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
});
it("keeps a no-commit snapshot distinct from an unavailable pinned file", async () => {
    const empty: RepositorySnapshot = { ...snapshot("empty"), status: "empty", commitSha: null, treeSha: null };
    expect((await file(empty, "a.ts")).status).toBe(409);
    expect(calls.some(c => c.url.pathname.includes("/contents/"))).toBe(false);
});
it("does not replace a denied raw-media read with another credential or HEAD", async () => {
    inline = false; privateRepo = true; const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => new Headers(init?.headers).get("Accept")?.includes("raw") ? Promise.resolve(new Response("Forbidden", { status: 403 })) : fixture(input, init)) as typeof fetch;
    expect((await file(snapshot("raw-denied", "private"), "a.ts", "dummy-caller")).status).toBe(403);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(jest.mocked(global.fetch).mock.calls.every(([, init]) => new Headers(init?.headers).get("Authorization") === "token dummy-caller")).toBe(true);
});
it("rejects an untrusted commit/tree mismatch before downloading or caching file bytes", async () => {
    const response = await file({ ...snapshot("mismatched-tree"), treeSha: "f".repeat(40) }, "a.ts");
    expect(response.status).toBe(400);
    expect(calls.some(c => c.url.pathname.includes("/contents/"))).toBe(false);
});
it("fails an unavailable pinned commit instead of reading current HEAD or calling it empty", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/git/commits/") ? Promise.resolve(new Response("Not found", { status: 404 })) : fixture(input, init)) as typeof fetch;
    expect((await file(snapshot("unavailable-commit"), "a.ts")).status).toBe(404);
    expect(calls.some(c => c.url.pathname.includes("/contents/"))).toBe(false);
});
it("keeps an upstream AbortError distinct from an ordinary failed file or batch", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/") ? Promise.reject(new DOMException("Cancelled", "AbortError")) : fixture(input, init)) as typeof fetch;
    expect((await batch(snapshot("upstream-abort"), ["a.ts"])).status).toBe(499);
    expect((await file(snapshot("upstream-abort-single"), "a.ts")).status).toBe(499);
});
it("stops manifest batches on cancellation instead of reporting successful empty manifests", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/contents/") ? Promise.reject(new DOMException("Cancelled", "AbortError")) : fixture(input, init)) as typeof fetch;
    const value = snapshot("manifest-abort"), context = await authorizeRepositoryRead("example", value.repo);
    await expect(fetchDependencyFiles(context, value)).rejects.toMatchObject({ name: "AbortError" });
    expect(jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/contents/"))).toHaveLength(4);
});
it("does not swallow already-aborted README/manifest work for empty snapshots", async () => {
    const value: RepositorySnapshot = { ...snapshot("empty-cancel"), status: "empty", commitSha: null, treeSha: null };
    const context = await authorizeRepositoryRead("example", value.repo), controller = new AbortController(); controller.abort();
    await expect(fetchReadme(context, value, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(fetchDependencyFiles(context, value, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});
it("does not turn an anonymous metadata fallback into private read authorization", async () => {
    privateRepo = true; const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => /^\/repos\/example\/[^/]+$/.test(new URL(String(input)).pathname) && new Headers(init?.headers).has("Authorization") ? Promise.resolve(new Response("Invalid credential", { status: 401 })) : fixture(input, init)) as typeof fetch;
    expect((await file(snapshot("anonymous-private", "private"), "a.ts", "dummy-invalid")).status).toBe(404);
    expect(calls.some(c => c.url.pathname.includes("/git/") || c.url.pathname.includes("/contents/"))).toBe(false);
});
it("cannot issue read contexts from a browser environment", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    try { await expect(authorizeRepositoryRead("example", "browser-context", "dummy-caller")).rejects.toThrow(/server/i); }
    finally { Reflect.deleteProperty(globalThis, "window"); }
    expect(calls).toHaveLength(0);
});
it("does not hide a newly unavailable pinned commit behind a warm public byte cache", async () => {
    const value = snapshot("warm-unavailable"); await file(value, "a.ts");
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => String(input).includes("/git/commits/") ? Promise.resolve(new Response("Commit unavailable", { status: 404 })) : fixture(input, init)) as typeof fetch;
    expect((await file(value, "a.ts")).status).toBe(404);
});
