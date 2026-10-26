/** @jest-environment node */
import { reserveServerAIAnalysis } from "@/lib/ai-budget";

const originalFetch = global.fetch;
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test-only";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-only";
});
afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

it.each([[1, "allowed"], [0, "exhausted"], [null, "unavailable"]])("handles admission result %s", async (result, expected) => {
    global.fetch = jest.fn(async () => Response.json([{ result }])) as typeof fetch;
    await expect(reserveServerAIAnalysis("198.51.100.1")).resolves.toBe(expected);
});

it("shares one daily global key across clients and uses one atomic EVAL command", async () => {
    const commands: unknown[][] = [];
    global.fetch = jest.fn(async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toHaveLength(1);
        commands.push(body[0]);
        return Response.json([{ result: 1 }]);
    }) as typeof fetch;
    await Promise.all([reserveServerAIAnalysis("198.51.100.1"), reserveServerAIAnalysis("198.51.100.2")]);
    expect(commands[0][0]).toBe("EVAL");
    expect(commands[0][3]).toBe(commands[1][3]);
    expect(commands[0][4]).not.toBe(commands[1][4]);
    expect(commands[0][5]).toBe(100);
    expect(commands[0][6]).toBe(10);
    expect(Number(commands[0][7])).toBeGreaterThan(0);
    expect(Number(commands[0][7])).toBeLessThanOrEqual(86400);
});

it.each(["missing", "network", "http", "redis", "malformed"])("fails closed for %s store failures", async mode => {
    if (mode === "missing") delete process.env.UPSTASH_REDIS_REST_TOKEN;
    global.fetch = jest.fn(async () => {
        if (mode === "network") throw new Error("offline");
        if (mode === "http") return new Response("error", { status: 503 });
        if (mode === "redis") return Response.json([{ error: "ERR" }]);
        return new Response("not JSON");
    }) as typeof fetch;
    await expect(reserveServerAIAnalysis("unknown")).resolves.toBe("unavailable");
    if (mode === "missing") expect(global.fetch).not.toHaveBeenCalled();
});
