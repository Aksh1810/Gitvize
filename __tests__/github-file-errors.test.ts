/** @jest-environment node */
import { NextRequest } from "next/server";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
jest.useFakeTimers();
const { GET } = jest.requireActual<typeof import("@/app/api/github/repo/file/route")>("@/app/api/github/repo/file/route");
afterAll(() => jest.useRealTimers());

const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
const originalPool = process.env.GITHUB_TOKENS;

beforeEach(() => {
    jest.advanceTimersByTime(60_000);
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKENS;
});
afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalPool === undefined) delete process.env.GITHUB_TOKENS;
    else process.env.GITHUB_TOKENS = originalPool;
});

it.each(["package.json", "README.md"])("reports exhausted GitHub quota when selecting %s", async path => {
    const resetAt = Math.ceil(Date.now() / 1000) + 120;
    global.fetch = jest.fn(async () => new Response("API rate limit exceeded", {
        status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) },
    })) as typeof fetch;

    const response = await GET(new NextRequest(`http://localhost/api/test?owner=example&repo=repo&path=${path}`));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThanOrEqual(119);
    expect(Number(response.headers.get("Retry-After"))).toBeLessThanOrEqual(121);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).error).toMatch(/GitHub API rate limit.*Try again/);
    // A failed visibility check must never fall through to a raw download.
    expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("preserves GitHub's secondary rate-limit retry delay", async () => {
    global.fetch = jest.fn(async () => new Response("Slow down", {
        status: 403, headers: { "retry-after": "60" },
    })) as typeof fetch;
    const response = await GET(new NextRequest("http://localhost/api/test?owner=example&repo=repo&path=README.md"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
});

it("reports HTTP 429 without inventing a retry delay from invalid headers", async () => {
    global.fetch = jest.fn(async () => new Response("Slow down", {
        status: 429, headers: { "retry-after": "invalid", "x-ratelimit-reset": "invalid" },
    })) as typeof fetch;
    const response = await GET(new NextRequest("http://localhost/api/test?owner=example&repo=repo&path=README.md"));
    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect((await response.json()).error).toMatch(/rate limit.*try again/i);
});

it("does not label an unrelated permission failure as quota exhaustion", async () => {
    global.fetch = jest.fn(async () => new Response("Forbidden", { status: 403 })) as typeof fetch;
    const response = await GET(new NextRequest("http://localhost/api/test?owner=example&repo=repo&path=README.md"));
    expect(response.status).not.toBe(429);
    expect((await response.json()).error).not.toMatch(/rate limit/i);
});
