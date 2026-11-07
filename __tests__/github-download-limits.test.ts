/** @jest-environment node */
import { authorizeRepositoryRead, fetchDependencyFiles, fetchFileContent } from "@/lib/github";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/github/repo/file/route";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (s: string) => s }));
const originalFetch = global.fetch;
const snapshot = (repo: string) => ({ schemaVersion: 1 as const, owner: "example", repo, selectedBranch: "main", defaultBranch: "main", status: "ready" as const, commitSha: "a".repeat(40), treeSha: "c".repeat(40), visibility: "public" as const, capturedAt: "2026-11-07T12:00:00.000Z" });
const read = (repo: string, path: string) => fetchFileContent("example", repo, path, undefined, snapshot(repo));
const limit = 512 * 1024;
afterEach(() => { global.fetch = originalFetch; });

it.each(["raw-media", "download-url", "inline"])("rejects oversized %s files", async mode => {
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } });
        if (url.pathname === `/repos/example/large-${mode}`) return Response.json({ private: false });
        if (url.pathname.includes("/contents/")) {
            if (mode !== "inline" && new Headers(init?.headers).get("Accept")?.includes("raw")) return new Response("a".repeat(limit + 1));
            return mode === "inline"
                ? Response.json({ type: "file", encoding: "base64", content: Buffer.alloc(limit + 1, "a").toString("base64") })
                : Response.json({ type: "file", download_url: "https://raw.githubusercontent.com/example/repo/HEAD/a.ts" });
        }
        return new Response("a".repeat(limit + 1));
    }) as typeof fetch;
    const rejected = await read(`large-${mode}`, "a.ts").then(() => false, error => /maximum|large/i.test(error.message));
    expect(rejected).toBe(true);
});

it("omits oversized dependency manifests and preserves small ones", async () => {
    global.fetch = jest.fn(async input => String(input).includes("/git/commits/") ? Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } }) : new URL(String(input)).pathname === "/repos/example/manifests" ? Response.json({ private: false }) : Response.json({ type: "file", encoding: "base64", content: Buffer.from(new URL(String(input)).pathname.endsWith("/package.json") ? "a".repeat(limit + 1) : "small").toString("base64") })) as typeof fetch;
    const { files, fetchError } = await fetchDependencyFiles(await authorizeRepositoryRead("example", "manifests"), snapshot("manifests"));
    expect(files).toHaveLength(7);
    expect(fetchError).toEqual(expect.any(String));
    expect(files.some(file => file.filename === "package.json")).toBe(false);
});

it("evicts file content by total bytes, keeping recent files cached", async () => {
    let downloads = 0;
    global.fetch = jest.fn(async input => {
        if (String(input).includes("/git/commits/")) return Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } });
        if (new URL(String(input)).pathname === "/repos/example/cache-budget") return Response.json({ private: false });
        downloads++;
        return Response.json({ type: "file", encoding: "base64", content: Buffer.alloc(limit, "a").toString("base64") });
    }) as typeof fetch;
    for (let i = 0; i < 18; i++) await read("cache-budget", `${i}.ts`);
    expect(downloads).toBe(18);
    await read("cache-budget", "17.ts");
    expect(downloads).toBe(18);
    await read("cache-budget", "0.ts");
    expect(downloads).toBe(19);
});

it("rejects oversized contents JSON without attempting raw fallback", async () => {
    const raw = jest.fn();
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } });
        if (url.pathname === "/repos/example/large-json") return Response.json({ private: false });
        if (url.hostname === "raw.githubusercontent.com") raw();
        return new Response("{}", { headers: { "content-length": String(9 * 1024 * 1024) } });
    }) as typeof fetch;
    await expect(read("large-json", "a.ts")).rejects.toThrow(/maximum/i);
    expect(raw).not.toHaveBeenCalled();
});

it("rejects oversized metadata before following a download URL and returns HTTP 413", async () => {
    const raw = jest.fn();
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } });
        if (url.pathname === "/repos/example/large-metadata") return Response.json({ private: false });
        if (url.hostname === "raw.githubusercontent.com") raw();
        return Response.json({ type: "file", size: limit + 1, download_url: "https://raw.githubusercontent.com/a" });
    }) as typeof fetch;
    const response = await GET(new NextRequest("http://localhost/api/test?" + new URLSearchParams({ owner: "example", repo: "large-metadata", path: "a.ts", snapshot: JSON.stringify(snapshot("large-metadata")) })));
    expect(response.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
});
