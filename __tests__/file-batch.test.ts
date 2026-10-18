/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/github/repo/files/route";
import { fetchFileContent } from "@/lib/github";
import { fetchSourceFiles } from "@/lib/file-batch";

jest.mock("@/lib/github", () => ({ fetchFileContent: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
    checkRateLimit: () => ({ ok: true }), getClientIp: () => "test",
}));

const originalFetch = global.fetch;
beforeEach(() => {
    jest.mocked(fetchFileContent).mockImplementation(async (_owner, _repo, path) => `source:${path}`);
    global.fetch = jest.fn(async (_url, init) => POST(new NextRequest(new Request(
        "http://localhost/api/github/repo/files", init,
    )))) as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

it.each([0, 50, 51, 60, 100])("loads all %i source files through the real bounded route", async count => {
    const paths = Array.from({ length: count }, (_, i) => `module-${i}.py`);
    const files = await fetchSourceFiles("example", "repo", paths, { "x-github-token": "test-only" });
    expect(files).toEqual(paths.map(path => ({ path, content: `source:${path}` })));
    expect(global.fetch).toHaveBeenCalledTimes(Math.ceil(count / 50));
    for (const path of paths) {
        expect(fetchFileContent).toHaveBeenCalledWith("example", "repo", path, "test-only");
    }
});

it.each(["http", "network"])("keeps successful files after a %s batch failure", async failure => {
    const routeFetch = global.fetch;
    const mockFetch = jest.fn().mockImplementation(routeFetch);
    if (failure === "http") mockFetch.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }));
    else mockFetch.mockRejectedValueOnce(new Error("Connection lost"));
    global.fetch = mockFetch;
    const paths = Array.from({ length: 60 }, (_, i) => `module-${i}.py`);
    const files = await fetchSourceFiles("example", "repo", paths, {});
    expect(files.map(file => file.path)).toEqual(paths.slice(50));
});

it("keeps the server limit enforced for direct oversized requests", async () => {
    const response = await POST(new NextRequest("http://localhost/api/github/repo/files", {
        method: "POST", body: JSON.stringify({ owner: "example", repo: "repo", paths: Array(51).fill("a.py") }),
    }));
    expect(response.status).toBe(400);
    expect(fetchFileContent).not.toHaveBeenCalled();
});
