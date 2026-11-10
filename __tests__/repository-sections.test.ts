/** @jest-environment node */
import { NextRequest } from "next/server";
import { fetchAllRepoData, fetchFileTree } from "@/lib/github";
import { GET as jsonRoute } from "@/app/api/github/repo/route";
import { GET as streamRoute } from "@/app/api/github/repo/stream/route";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "fixture", scrubSecrets: (s: string) => s }));
const A = "a".repeat(40), T = "b".repeat(40);
const originalFetch = global.fetch;
let currentCommit: string;
let failures: Record<string, number>, upstreamTruncated: boolean, items: Array<{ path: string; type: string }>, manifests: Record<string, string>;
beforeEach(() => {
    currentCommit = A; failures = {}; upstreamTruncated = false; items = []; manifests = {};
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        const key = url.pathname.includes("/contents/") ? url.pathname.split("/contents/")[1] : url.pathname.split("/").pop()!;
        if (failures[key]) return Response.json({ message: "Upstream response with secret ghp_not_for_display" }, { status: failures[key], headers: failures[key] === 429 ? { "Retry-After": "30" } : {} });
        if (url.pathname === "/repos/example/sections") return Response.json({ private: false, default_branch: "main", topics: [] });
        if (url.pathname.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha: currentCommit } });
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: currentCommit, tree: { sha: T } });
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: T, tree: items, truncated: upstreamTruncated });
        if (url.pathname.includes("/contents/")) return manifests[key] === undefined ? Response.json({ message: "Not found" }, { status: 404 }) : Response.json({ type: "file", encoding: "base64", content: Buffer.from(manifests[key]).toString("base64") });
        if (key === "readme") return Response.json({ message: "Not found" }, { status: 404 });
        if (key === "languages") return Response.json({ TypeScript: 200 });
        return Response.json([]);
    }) as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });
it.each([false, true])("keeps upstream truncation separate from the application cap (upstream %s)", async truncated => {
    upstreamTruncated = truncated; items = Array.from({ length: 5002 }, (_, i) => ({ path: `${i}.ts`, type: i === 0 ? "tree" : "blob" }));
    const tree = await fetchFileTree("example", "sections", T);
    expect(tree.tree).toHaveLength(5000);
    expect(tree.coverage).toEqual({ upstreamTruncated: truncated, applicationCapped: true, enumeratedTreeItems: 5002, enumeratedFiles: 5001, retainedTreeItems: 5000, retainedFiles: 4999, totalTreeItems: truncated ? null : 5002, totalFiles: truncated ? null : 5001 });
});
it("keeps confirmed absence separate from optional failures, sanitizes errors and preserves successful manifests", async () => {
    failures = { languages: 429, branches: 503, "requirements.txt": 503 };
    manifests = { "package.json": '{"dependencies":{"react":"19"}}' };
    const result = await fetchAllRepoData("example", "sections");
    expect(result.sections.languages).toMatchObject({ status: "error", error: { code: "rate_limited", status: 429, retryAfter: 30 } });
    expect(result.sections.branches).toMatchObject({ status: "error", error: { code: "upstream", status: 503 } });
    expect(result.sections.dependencyFiles).toMatchObject({ status: "partial", data: [{ filename: "package.json" }], errors: [{ code: "upstream", status: 503 }] });
    expect(JSON.stringify(result.sections)).not.toContain("ghp_");
    expect(result.defaultHistory.complete).toBe(true);
    expect(result.defaultHistory.error).toBeNull();
    failures = {}; manifests = {}; currentCommit = "d".repeat(40);
    const empty = await fetchAllRepoData("example", "sections");
    expect(empty.sections.dependencyFiles).toEqual({ status: "ready", data: [] });
    expect(empty.sections.branches).toEqual({ status: "ready", data: [] });
});
it.each([jsonRoute, streamRoute])("carries section failures and coverage through the actual JSON/SSE entry point", async handler => {
    failures = { languages: 503, branches: 403 }; upstreamTruncated = true;
    const response = await handler(new NextRequest("http://localhost/api/repo?owner=example&repo=sections"));
    const text = await response.text();
    const data = response.headers.get("Content-Type")?.includes("event-stream") ? text.split("\n").filter(s => s.startsWith("data: ")).map(s => JSON.parse(s.slice(6))).find(e => e.type === "done").payload : JSON.parse(text);
    expect(data.schemaVersion).toBe(2);
    expect(data.sections.languages).toMatchObject({ status: "error", error: { status: 503 } });
    expect(data.sections.branches).toMatchObject({ status: "error", error: { code: "forbidden" } });
    expect(data.fileTree.coverage.upstreamTruncated).toBe(true);
});
it("retains successful contributor pages after a sibling page failure", async () => {
    const fixture = global.fetch;
    global.fetch = jest.fn((input, init) => {
        const url = new URL(String(input));
        if (!url.pathname.endsWith("/contributors")) return fixture(input, init);
        const page = Number(url.searchParams.get("page"));
        return Promise.resolve(page === 2 ? Response.json({}, { status: 503 }) : Response.json(Array.from({ length: 100 }, (_, i) => ({ login: `person-${page}-${i}`, id: page * 100 + i, contributions: 1 }))));
    }) as typeof fetch;
    const result = await fetchAllRepoData("example", "sections", "dummy-public-caller");
    expect(result.contributors).toHaveLength(400);
    expect(result.sections.contributors).toMatchObject({ status: "partial", errors: expect.arrayContaining([expect.objectContaining({ code: "upstream" })]) });
});

it("does not call a known manifest absent when its pinned content endpoint denies it with 404", async () => {
    currentCommit = "e".repeat(40); items = [{ path: "package.json", type: "blob" }]; failures = { "package.json": 404 };
    const result = await fetchAllRepoData("example", "sections");
    expect(result.sections.dependencyFiles).toMatchObject({ status: "error", error: { code: "not_found", status: 404 } });
});
it("does not claim confirmed manifest absence from a truncated inventory", async () => {
    currentCommit = "f".repeat(40); upstreamTruncated = true;
    const result = await fetchAllRepoData("example", "sections");
    expect(result.sections.dependencyFiles.status).toBe("error");
});
