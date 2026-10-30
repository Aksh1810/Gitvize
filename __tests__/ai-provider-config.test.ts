/** @jest-environment node */
import { NextRequest } from "next/server";
import { analyzeRepository } from "@/lib/ai";
import { POST } from "@/app/api/analyze/route";

jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "fixture", scrubSecrets: (s: string) => s }));
jest.mock("@/lib/ai-budget", () => ({ reserveServerAIAnalysis: jest.fn(async () => "allowed") }));

const providers = [
    ["openai", "gpt-4o-mini"], ["anthropic", "claude-sonnet-4-6"], ["gemini", "gemini-2.5-flash"],
] as const;
const metadata = JSON.stringify({ techStack: [], architecturePattern: "Modular", description: "Fixture", modules: [], entryPoints: [] });
const diagram = "flowchart TB\nA-->B";
const envNames = ["AI_API_KEY", "AI_PROVIDER", "AI_MODEL", "AI_BASE_URL", "GEMINI_API_KEY", "GEMINI_API_KEYS"] as const;
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;

function response(provider: string, content: string, truncated = false) {
    if (provider === "gemini") return Response.json({ candidates: [{ finishReason: truncated ? "MAX_TOKENS" : "STOP", content: { parts: [{ text: content }] } }] });
    if (provider === "anthropic") return Response.json({ stop_reason: truncated ? "max_tokens" : "end_turn", content: [{ type: "text", text: content }] });
    return Response.json({ choices: [{ finish_reason: truncated ? "length" : "stop", message: { content } }] });
}
function mockCompletion(provider: string, truncated = false) {
    global.fetch = jest.fn().mockResolvedValueOnce(response(provider, diagram, truncated)).mockResolvedValueOnce(response(provider, metadata));
}
function bodies() { return jest.mocked(global.fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string)); }

beforeEach(() => {
    envNames.forEach(name => delete process.env[name]);
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
    global.fetch = originalFetch;
    envNames.forEach(name => { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name]; });
    jest.restoreAllMocks();
});

it.each(providers)("emits documented %s payloads with separate diagram and metadata budgets", async (provider, model) => {
    mockCompletion(provider);
    expect(await analyzeRepository("example", "repo", [], "", undefined, { provider, model, apiKey: "fixture-secret-only" })).toMatchObject({ source: "pending", metadataSource: "ai" });
    const calls = jest.mocked(global.fetch).mock.calls;
    expect(calls).toHaveLength(2);
    const [drawing, details] = bodies();
    if (provider === "gemini") {
        for (const [url, init] of calls) {
            expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
            expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("fixture-secret-only");
        }
        expect(drawing.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } });
        expect(details.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" });
    } else {
        expect(drawing.model).toBe(model);
        expect(details.model).toBe(model);
        expect(drawing.max_tokens).toBe(4096);
        expect(details.max_tokens).toBe(2048);
        expect(drawing.response_format).toBeUndefined();
        if (provider === "openai") {
            expect(calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
            expect(new Headers(calls[0][1]?.headers).get("Authorization")).toBe("Bearer fixture-secret-only");
            expect(details.response_format).toEqual({ type: "json_object" });
        } else {
            expect(calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
            expect(new Headers(calls[0][1]?.headers).get("anthropic-version")).toBe("2023-06-01");
            expect(drawing.thinking).toEqual({ type: "disabled" });
            expect(drawing.output_config).toBeUndefined();
            expect(details.output_config.format).toMatchObject({ type: "json_schema", schema: { type: "object", required: expect.arrayContaining(["techStack", "modules", "description"]) } });
        }
    }
});

it.each(providers)("server and omitted caller %s defaults agree", async (provider, model) => {
    mockCompletion(provider);
    const request = new NextRequest("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ owner: "example", repo: "repo", tree: [], mode: "premium", aiSettings: { provider, apiKey: "fixture-secret-only" } }) });
    await (await POST(request)).text();
    if (provider === "gemini") expect(jest.mocked(global.fetch).mock.calls[0][0]).toContain(`/models/${model}:`);
    else expect(bodies()[0].model).toBe(model);
    process.env.AI_API_KEY = "fixture-secret-only";
    process.env.AI_PROVIDER = provider;
    mockCompletion(provider);
    await analyzeRepository("example", "repo", [], "");
    if (provider === "gemini") expect(jest.mocked(global.fetch).mock.calls[0][0]).toContain(`/models/${model}:`);
    else expect(bodies()[0].model).toBe(model);
});

it("preserves an explicit server model and provider even when a Gemini pool exists", async () => {
    process.env.AI_API_KEY = "operator-fixture-only";
    process.env.GEMINI_API_KEY = "gemini-fixture-only";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4o-2024-11-20";
    mockCompletion("openai");
    expect(await analyzeRepository("example", "repo", [], "")).toMatchObject({ source: "pending" });
    expect(jest.mocked(global.fetch).mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(bodies()[0].model).toBe("gpt-4o-2024-11-20");
});

it.each(["unlisted-model", "claude-3-5-sonnet-20241022"])("does not replace an explicit unsupported server model or call its provider", async model => {
    process.env.AI_API_KEY = "operator-fixture-only";
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL = model;
    global.fetch = jest.fn(async () => new Response("not found", { status: 404 }));
    const result = await analyzeRepository("example", "repo", [], "");
    expect(result).toMatchObject({ source: "fallback", metadataSource: "deterministic", fallbackReason: expect.stringMatching(/model.*(supported|retired)/i) });
    expect(global.fetch).not.toHaveBeenCalled();
});

it("returns an actionable model error without provider text or secrets in results/logs", async () => {
    global.fetch = jest.fn(async () => new Response("model_not_found fixture-secret-only https://upstream.example?key=fixture-secret-only", { status: 404 }));
    const result = await analyzeRepository("example", "repo", [], "", undefined, { provider: "openai", model: "gpt-4o-mini", apiKey: "fixture-secret-only" });
    expect(result).toMatchObject({ source: "fallback", fallbackReason: expect.stringMatching(/model.*(unavailable|access)/i) });
    const messages = JSON.stringify([result, jest.mocked(console.warn).mock.calls, jest.mocked(console.error).mock.calls, jest.mocked(console.log).mock.calls]);
    expect(messages).not.toContain("fixture-secret-only");
    expect(messages).not.toContain("upstream.example");
});

it.each(providers)("keeps %s stage-budget truncation as fallback while retaining good metadata", async (provider, model) => {
    mockCompletion(provider, true);
    const result = await analyzeRepository("example", "repo", [], "", undefined, { provider, model, apiKey: "fixture-secret-only" });
    expect(result).toMatchObject({ source: "fallback", metadataSource: "ai" });
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(2);
});

it.each(providers)("keeps a complete %s diagram when the metadata budget is exhausted", async (provider, model) => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(provider, diagram)).mockResolvedValueOnce(response(provider, metadata, true));
    expect(await analyzeRepository("example", "repo", [], "", undefined, { provider, model, apiKey: "fixture-secret-only" })).toMatchObject({ source: "pending", metadataSource: "deterministic" });
});

it("still rotates server Gemini keys after a credential failure without putting keys in URLs", async () => {
    process.env.GEMINI_API_KEYS = "pool-one-fixture,pool-two-fixture";
    let rejectedKey: string | null = null;
    global.fetch = jest.fn(async (_url, init) => {
        const key = new Headers(init?.headers).get("x-goog-api-key");
        rejectedKey ??= key;
        if (key === rejectedKey) return new Response("invalid API key", { status: 403 });
        const body = JSON.parse(init!.body as string);
        return response("gemini", body.generationConfig.responseMimeType ? metadata : diagram);
    }) as typeof fetch;
    expect(await analyzeRepository("example", "repo", [], "")).toMatchObject({ source: "pending", metadataSource: "ai" });
    const calls = jest.mocked(global.fetch).mock.calls;
    expect(new Set(calls.map(([, init]) => new Headers(init?.headers).get("x-goog-api-key"))).size).toBe(2);
    expect(calls.every(([url]) => !String(url).includes("fixture"))).toBe(true);
});

it("never rotates a failed caller Gemini key into the operator pool", async () => {
    process.env.GEMINI_API_KEYS = "operator-one-fixture,operator-two-fixture";
    global.fetch = jest.fn(async () => new Response("denied", { status: 403 })) as typeof fetch;
    expect(await analyzeRepository("example", "repo", [], "", undefined, { provider: "gemini", model: "gemini-2.5-flash", apiKey: "caller-fixture-only" })).toMatchObject({ source: "fallback", metadataSource: "deterministic" });
    const calls = jest.mocked(global.fetch).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("caller-fixture-only");
});
