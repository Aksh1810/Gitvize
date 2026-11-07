/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/github/repo/files/route";
import { authorizeRepositoryRead, readFileAtSnapshot, type RepositoryReadContext } from "@/lib/github";
import { fetchSourceFiles } from "@/lib/file-batch";

jest.mock("@/lib/github", () => ({ authorizeRepositoryRead: jest.fn(), readFileAtSnapshot: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
    checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (s: string) => s,
}));

const originalFetch = global.fetch;
const snapshot = { schemaVersion: 1 as const, owner: "example", repo: "repo", selectedBranch: "main", defaultBranch: "main", status: "ready" as const, commitSha: "a".repeat(40), treeSha: "c".repeat(40), visibility: "public" as const, capturedAt: "2026-11-07T12:00:00.000Z" };
const context = {} as RepositoryReadContext;
beforeEach(() => {
    jest.mocked(authorizeRepositoryRead).mockResolvedValue(context);
    jest.mocked(readFileAtSnapshot).mockImplementation(async (_owner, _repo, path) => `source:${path}`);
    global.fetch = jest.fn(async (_url, init) => POST(new NextRequest(new Request(
        "http://localhost/api/github/repo/files", init,
    )))) as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

it("does not return successful empty sources when every submitted batch fails", async () => {
    global.fetch = jest.fn(async () => Response.json({ error: "Pinned content unavailable" }, { status: 404 })) as typeof fetch;
    await expect(fetchSourceFiles("example", "repo", ["a.py"], {}, undefined, snapshot)).rejects.toThrow(/Pinned content unavailable/);
});

it("does not swallow a successful HTTP response reporting no requested sources as empty success", async () => {
    global.fetch = jest.fn(async () => Response.json({ files: [], errors: [{ path: "a.py", status: 403, error: "Forbidden" }] })) as typeof fetch;
    await expect(fetchSourceFiles("example", "repo", ["a.py"], {}, undefined, snapshot)).rejects.toThrow();
});
it("preserves server cancellation as AbortError rather than ordinary unavailable sources", async () => {
    global.fetch = jest.fn(async () => Response.json({ error: "File batch cancelled" }, { status: 499 })) as typeof fetch;
    await expect(fetchSourceFiles("example", "repo", ["a.py"], {}, undefined, snapshot)).rejects.toMatchObject({ name: "AbortError" });
});

it.each([0, 50, 51, 60, 100])("loads all %i source files through the real bounded route", async count => {
    const paths = Array.from({ length: count }, (_, i) => `module-${i}.py`);
    const files = await fetchSourceFiles("example", "repo", paths, { "x-github-token": "test-only" }, undefined, snapshot);
    expect(files).toEqual(paths.map(path => ({ path, content: `source:${path}` })));
    expect(global.fetch).toHaveBeenCalledTimes(Math.ceil(count / 50));
    for (const path of paths) {
        expect(readFileAtSnapshot).toHaveBeenCalledWith(context, snapshot, path, expect.any(AbortSignal));
    }
});

it.each(["http", "network"])("keeps successful files after a %s batch failure", async failure => {
    const routeFetch = global.fetch;
    const mockFetch = jest.fn().mockImplementation(routeFetch);
    if (failure === "http") mockFetch.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }));
    else mockFetch.mockRejectedValueOnce(new Error("Connection lost"));
    global.fetch = mockFetch;
    const paths = Array.from({ length: 60 }, (_, i) => `module-${i}.py`);
    const files = await fetchSourceFiles("example", "repo", paths, {}, undefined, snapshot);
    expect(files.map(file => file.path)).toEqual(paths.slice(50));
});

it("keeps the server limit enforced for direct oversized requests", async () => {
    const response = await POST(new NextRequest("http://localhost/api/github/repo/files", {
        method: "POST", body: JSON.stringify({ owner: "example", repo: "repo", paths: Array(51).fill("a.py") }),
    }));
    expect(response.status).toBe(400);
    expect(readFileAtSnapshot).not.toHaveBeenCalled();
});

it("deduplicates paths and limits concurrent reads while preserving order", async () => {
    let active = 0;
    let peak = 0;
    jest.mocked(readFileAtSnapshot).mockImplementation(async (_owner, _repo, path) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active--;
        return path;
    });
    const paths = Array.from({ length: 12 }, (_, i) => `${i}.ts`);
    const response = await POST(new NextRequest("http://localhost/api/test", { method: "POST",
        body: JSON.stringify({ owner: "example", repo: "repo", snapshot, paths: [...paths, paths[0]] }),
    }));
    expect((await response.json()).files.map((file: { path: string }) => file.path)).toEqual(paths);
    expect(peak).toBeLessThanOrEqual(4);
    expect(readFileAtSnapshot).toHaveBeenCalledTimes(paths.length);
});

it("rejects a batch exceeding the serialized byte budget without fetching remaining chunks", async () => {
    jest.mocked(readFileAtSnapshot).mockResolvedValue("a".repeat(512 * 1024));
    const response = await POST(new NextRequest("http://localhost/api/test", { method: "POST",
        body: JSON.stringify({ owner: "example", repo: "repo", snapshot, paths: Array.from({ length: 12 }, (_, i) => `${i}.ts`) }),
    }));
    expect(response.status).toBe(413);
    expect(readFileAtSnapshot).toHaveBeenCalledTimes(4);
});

it("rejects already-aborted batching before any request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchSourceFiles("example", "repo", ["a.py"], {}, controller.signal, snapshot)).rejects.toMatchObject({ name: "AbortError" });
    expect(global.fetch).not.toHaveBeenCalled();
});

it.each(["headers", "body"])("rejects cancellation during %s even if fetch ignores abort, without submitting later batches", async stage => {
    const controller = new AbortController();
    const paths = Array.from({ length: 120 }, (_, i) => `${i}.py`);
    global.fetch = jest.fn(async () => {
        if (stage === "headers") controller.abort();
        return { ok: true, json: async () => { if (stage === "body") controller.abort(); return { files: [{ path: "0.py", content: "partial" }] }; } };
    }) as unknown as typeof fetch;
    await expect(fetchSourceFiles("example", "repo", paths, {}, controller.signal, snapshot)).rejects.toMatchObject({ name: "AbortError" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal).toBe(controller.signal);
});

it("does not swallow an AbortError as successful empty data", async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(fetchSourceFiles("example", "repo", ["a.py", "b.py"], {}, undefined, snapshot)).rejects.toMatchObject({ name: "AbortError" });
});

it("deduplicates submitted paths before splitting client batches", async () => {
    const paths = Array.from({ length: 50 }, (_, i) => `${i}.py`);
    const files = await fetchSourceFiles("example", "repo", [...paths, ...paths], {}, undefined, snapshot);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(files.map(file => file.path)).toEqual(paths);
});

it("keeps earlier and later successful batches around an ordinary middle failure", async () => {
    const paths = Array.from({ length: 120 }, (_, i) => `${i}.py`);
    const routeFetch = global.fetch;
    global.fetch = jest.fn().mockImplementationOnce(routeFetch).mockRejectedValueOnce(new Error("Temporary ordinary failure")).mockImplementation(routeFetch);
    const files = await fetchSourceFiles("example", "repo", paths, {}, undefined, snapshot);
    expect(files.map(file => file.path)).toEqual([...paths.slice(0, 50), ...paths.slice(100)]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
});

it("rejects cancellation during a second batch rather than returning its earlier partial data", async () => {
    const controller = new AbortController(); let calls = 0;
    const paths = Array.from({ length: 120 }, (_, i) => `${i}.py`);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => {
        if (++calls === 2) controller.abort();
        return { files: [{ path: `${calls}.py`, content: "source" }] };
    } })) as unknown as typeof fetch;
    await expect(fetchSourceFiles("example", "repo", paths, {}, controller.signal, snapshot)).rejects.toMatchObject({ name: "AbortError" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
});
