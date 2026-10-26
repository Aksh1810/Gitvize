/** @jest-environment node */
import { fetchDependencyFiles, fetchFileContent } from "@/lib/github";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/github/repo/file/route";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (s: string) => s }));
const originalFetch = global.fetch;
const limit = 512 * 1024;
afterEach(() => { global.fetch = originalFetch; });

it.each(["fallback", "download-url", "inline"])("rejects oversized %s files", async mode => {
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname === `/repos/example/large-${mode}`) return Response.json({ private: false });
        if (url.pathname.includes("/contents/")) {
            if (mode === "fallback") return new Response("Not found", { status: 404 });
            return mode === "inline"
                ? Response.json({ type: "file", encoding: "base64", content: Buffer.alloc(limit + 1, "a").toString("base64") })
                : Response.json({ type: "file", download_url: "https://raw.githubusercontent.com/example/repo/HEAD/a.ts" });
        }
        return new Response("a".repeat(limit + 1));
    }) as typeof fetch;
    const rejected = await fetchFileContent("example", `large-${mode}`, "a.ts").then(() => false, error => /maximum|large/i.test(error.message));
    expect(rejected).toBe(true);
});

it("omits oversized dependency manifests and preserves small ones", async () => {
    global.fetch = jest.fn(async input => new Response(String(input).endsWith("/package.json") ? "a".repeat(limit + 1) : "small")) as typeof fetch;
    const files = await fetchDependencyFiles("example", "manifests");
    expect(files).toHaveLength(7);
    expect(files.some(file => file.filename === "package.json")).toBe(false);
});

it("evicts file content by total bytes, keeping recent files cached", async () => {
    let downloads = 0;
    global.fetch = jest.fn(async input => {
        if (new URL(String(input)).pathname === "/repos/example/cache-budget") return Response.json({ private: false });
        downloads++;
        return Response.json({ type: "file", encoding: "base64", content: Buffer.alloc(limit, "a").toString("base64") });
    }) as typeof fetch;
    for (let i = 0; i < 18; i++) await fetchFileContent("example", "cache-budget", `${i}.ts`);
    expect(downloads).toBe(18);
    await fetchFileContent("example", "cache-budget", "17.ts");
    expect(downloads).toBe(18);
    await fetchFileContent("example", "cache-budget", "0.ts");
    expect(downloads).toBe(19);
});

it("rejects oversized contents JSON without attempting raw fallback", async () => {
    const raw = jest.fn();
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname === "/repos/example/large-json") return Response.json({ private: false });
        if (url.hostname === "raw.githubusercontent.com") raw();
        return new Response("{}", { headers: { "content-length": String(9 * 1024 * 1024) } });
    }) as typeof fetch;
    await expect(fetchFileContent("example", "large-json", "a.ts")).rejects.toThrow(/maximum/i);
    expect(raw).not.toHaveBeenCalled();
});

it("rejects oversized metadata before following a download URL and returns HTTP 413", async () => {
    const raw = jest.fn();
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname === "/repos/example/large-metadata") return Response.json({ private: false });
        if (url.hostname === "raw.githubusercontent.com") raw();
        return Response.json({ type: "file", size: limit + 1, download_url: "https://raw.githubusercontent.com/a" });
    }) as typeof fetch;
    const response = await GET(new NextRequest("http://localhost/api/test?owner=example&repo=large-metadata&path=a.ts"));
    expect(response.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
});
