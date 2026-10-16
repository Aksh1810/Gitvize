/** @jest-environment node */

import { NextRequest } from "next/server";
import { checkRepoAccess, fetchAllRepoData, fetchCommitsPage, fetchFileContent } from "@/lib/github";
import { GET as getRepo } from "@/app/api/github/repo/route";
import { GET as getStream } from "@/app/api/github/repo/stream/route";
import { GET as getFile } from "@/app/api/github/repo/file/route";
import { POST as getFiles } from "@/app/api/github/repo/files/route";
import { GET as getCommits } from "@/app/api/github/repo/commits/route";
import { GET as getAccess } from "@/app/api/github/repo/access/route";
import { GET as getSeed } from "@/app/api/graph/seed/route";

jest.mock("next/cache", () => {
    const entries = new Map<string, unknown>();
    return { unstable_cache: (callback: (...args: string[]) => Promise<unknown>) => async (...args: string[]) => {
        const key = JSON.stringify(args);
        if (!entries.has(key)) entries.set(key, await callback(...args));
        return entries.get(key);
    } };
});
jest.mock("@/lib/rate-limit", () => ({
    checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (value: string) => value,
}));

const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
const originalPool = process.env.GITHUB_TOKENS;
let isPrivate: boolean;
let revoked: boolean;
let usedServerForData: boolean;

beforeEach(() => {
    process.env.GITHUB_TOKEN = "server-test-only";
    delete process.env.GITHUB_TOKENS;
    isPrivate = true;
    revoked = false;
    usedServerForData = false;
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input));
        const auth = new Headers(init?.headers).get("Authorization");
        const server = auth === "token server-test-only" || auth === "token pool-test-only";
        const caller = auth === "token caller-test-only" && !revoked;
        if (auth === "token invalid-test-only") return new Response("Invalid token", { status: 401 });
        if (isPrivate && !server && !caller) return new Response("Not found", { status: 404 });
        if (/^\/repos\/example\/[^/]+$/.test(url.pathname)) {
            return Response.json({ private: isPrivate, full_name: "example/repo", default_branch: "main", topics: [], description: "private-marker" });
        }
        usedServerForData ||= server;
        if (url.pathname.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", content: Buffer.from("private-marker").toString("base64") });
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: "tree", tree: [{ path: "private-marker.ts", type: "blob", sha: "blob" }] });
        if (url.hostname === "raw.githubusercontent.com" || url.pathname.endsWith("/readme")) return new Response("Not found", { status: 404 });
        return Response.json([]);
    }) as typeof fetch;
});

afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalPool === undefined) delete process.env.GITHUB_TOKENS;
    else process.env.GITHUB_TOKENS = originalPool;
});

it.each([
    ["repo", getRepo], ["stream", getStream], ["file", getFile], ["commits", getCommits], ["access", getAccess], ["seed", getSeed],
])("does not expose operator-private data through the %s route", async (route, handler) => {
    const response = await handler(new NextRequest(`http://localhost/api/test?owner=example&repo=route-${route}&path=private.ts`));
    const body = await response.text();
    expect(body).not.toContain("private-marker");
    if (route === "access") expect(JSON.parse(body)).toMatchObject({ ok: false });
    expect(usedServerForData).toBe(false);
});

it("omits operator-private files from batch responses", async () => {
    const response = await getFiles(new NextRequest("http://localhost/api/test", {
        method: "POST", body: JSON.stringify({ owner: "example", repo: "batch", paths: ["private.ts"] }),
    }));
    expect(await response.json()).toEqual({ files: [] });
});

it("rejects invalid caller tokens without inheriting operator permissions", async () => {
    await expect(fetchFileContent("example", "invalid", "private.ts", "invalid-test-only")).rejects.toThrow();
    expect(await checkRepoAccess("example", "invalid", "invalid-test-only")).toMatchObject({ ok: false });
});

it("rejects private reads with pool-only server configuration", async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKENS = "pool-test-only";
    await expect(fetchCommitsPage("example", "pool", "main", 1, 10)).rejects.toThrow();
});

it("preserves caller-authorized private reads", async () => {
    expect(await checkRepoAccess("example", "caller", "caller-test-only")).toMatchObject({ ok: true, isPrivate: true });
    await expect(fetchFileContent("example", "caller", "private.ts", "caller-test-only")).resolves.toBe("private-marker");
});

it("preserves server-token throughput for public repositories", async () => {
    isPrivate = false;
    await expect(fetchAllRepoData("example", "public")).resolves.toMatchObject({ metadata: { fullName: "example/repo" } });
    expect(usedServerForData).toBe(true);
});

it("keeps invalid-token retries usable for public repositories", async () => {
    isPrivate = false;
    await expect(fetchFileContent("example", "public-invalid", "index.ts", "invalid-test-only")).resolves.toBe("private-marker");
    expect(usedServerForData).toBe(false);
});

it("keeps public repositories available when the configured server token has expired", async () => {
    isPrivate = false;
    process.env.GITHUB_TOKEN = "invalid-test-only";
    await expect(checkRepoAccess("example", "expired-server")).resolves.toMatchObject({ ok: true, isPrivate: false });
});

it("does not share caller-authenticated aggregate data when the caller token equals the server token", async () => {
    await fetchAllRepoData("example", "server-as-caller", "server-test-only");
    await expect(fetchAllRepoData("example", "server-as-caller")).rejects.toThrow();
});

it("rechecks visibility before serving a warmed aggregate cache", async () => {
    isPrivate = false;
    await fetchAllRepoData("example", "visibility");
    isPrivate = true;
    await expect(fetchAllRepoData("example", "visibility")).rejects.toThrow();
});

it("rechecks access before serving a private file cached with a revoked credential", async () => {
    await fetchFileContent("example", "revoked", "private.ts", "caller-test-only");
    revoked = true;
    await expect(fetchFileContent("example", "revoked", "private.ts", "caller-test-only")).rejects.toThrow();
});

it.each([
    "%2e%2e/%2e%2e/private-target/HEAD/secret.txt",
    ".%2e/.%2e/private-target/HEAD/secret.txt",
    "../../private-target/HEAD/secret.txt",
])("does not forward server credentials through raw-file traversal: %s", async (path) => {
    isPrivate = false;
    const fetchRepo = global.fetch;
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.includes("/contents/")) return new Response("Not found", { status: 404 });
        if (url.hostname === "raw.githubusercontent.com") {
            return url.pathname === "/example/private-target/HEAD/secret.txt"
                ? new Response("private-marker")
                : new Response("Not found", { status: 404 });
        }
        return fetchRepo(input, init);
    }) as typeof fetch;
    await expect(fetchFileContent("example", "public-traversal", path)).rejects.toThrow();
});

it("preserves raw-file fallback for public repositories", async () => {
    isPrivate = false;
    const fetchRepo = global.fetch;
    global.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.includes("/contents/")) return new Response("Not found", { status: 404 });
        if (url.hostname === "raw.githubusercontent.com") return new Response("public raw source");
        return fetchRepo(input, init);
    }) as typeof fetch;
    await expect(fetchFileContent("example", "public-raw", "src/index.ts")).resolves.toBe("public raw source");
});
