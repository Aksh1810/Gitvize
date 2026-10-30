/** @jest-environment node */
import { analyzeRepository } from "@/lib/ai";
import type { TreeItem } from "@/types";

const tree: TreeItem[] = [{ path: "src/index.ts", type: "blob", sha: "blob", mode: "100644", url: "https://api.github.com/blob" }];
const config = { provider: "openai", apiKey: "caller-test-only", model: "gpt-4o-mini" };
const originalFetch = global.fetch;
const metadata = JSON.stringify({ techStack: ["TypeScript"], architecturePattern: "Modular", description: "Provider metadata", modules: [], entryPoints: ["src/index.ts"] });
const completion = (content: string, finishReason = "stop") => Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });

beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

it("does not call two failed provider stages an AI diagram", async () => {
    global.fetch = jest.fn(async () => new Response("Credential denied: caller-test-only", { status: 401 })) as typeof fetch;
    const result = await analyzeRepository("example", "repo", tree, "", undefined, config);
    expect(result).toMatchObject({ source: "fallback", metadataSource: "deterministic" });
    expect(result.fallbackReason).not.toContain("caller-test-only");
});

it("keeps successful metadata separate from failed diagram generation", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(new Response("Unavailable", { status: 503 })).mockResolvedValueOnce(completion(metadata));
    const result = await analyzeRepository("example", "repo", tree, "", undefined, config);
    expect(result).toMatchObject({ source: "fallback", metadataSource: "ai", architecture: { description: "Provider metadata" } });
});

it("does not promote an invalid diagram prefix when metadata succeeds", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(completion("This is not a Mermaid diagram")).mockResolvedValueOnce(completion(metadata));
    expect(await analyzeRepository("example", "repo", tree, "", undefined, config)).toMatchObject({ source: "fallback", metadataSource: "ai" });
});

it("marks a provider diagram pending syntax validation when metadata fails", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(completion('flowchart TB\nA["File"] --> B["Service"]')).mockResolvedValueOnce(completion("{broken"));
    expect(await analyzeRepository("example", "repo", tree, "", undefined, config)).toMatchObject({ source: "pending", metadataSource: "deterministic" });
});

it("treats schema-invalid metadata as deterministic instead of trusting arrays of wrong types", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(completion("flowchart TB\nA-->B")).mockResolvedValueOnce(completion('{"techStack":"invented","modules":[]}'));
    const result = await analyzeRepository("example", "repo", tree, "", undefined, config);
    expect(result).toMatchObject({ source: "pending", metadataSource: "deterministic" });
    expect(Array.isArray(result.architecture.techStack)).toBe(true);
});

it.each(["flowchart TB\nA-->B\n%%" + "x".repeat(65_536), "flowchart TB\nA-->B\n%%" + "é".repeat(33_000)])("rejects provider diagram bytes above 64 KiB", async code => {
    global.fetch = jest.fn().mockResolvedValueOnce(completion(code)).mockResolvedValueOnce(completion(metadata));
    expect(await analyzeRepository("example", "repo", tree, "", undefined, config)).toMatchObject({ source: "fallback" });
});

it("rejects a provider-truncated diagram even if its prefix is parseable", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(completion("flowchart TB\nA-->B", "length")).mockResolvedValueOnce(completion(metadata));
    expect(await analyzeRepository("example", "repo", tree, "", undefined, config)).toMatchObject({ source: "fallback", metadataSource: "ai" });
});

it.each(["gemini", "anthropic"])("does not promote truncated %s output", async provider => {
    const diagram = "flowchart TB\nA-->B";
    const truncated = provider === "gemini"
        ? Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: diagram }] } }] })
        : Response.json({ stop_reason: "max_tokens", content: [{ type: "text", text: diagram }] });
    global.fetch = jest.fn().mockResolvedValueOnce(truncated).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    const model = provider === "gemini" ? "gemini-2.5-flash" : "claude-sonnet-4-6";
    expect(await analyzeRepository("example", "repo", tree, "", undefined, { ...config, provider, model })).toMatchObject({ source: "fallback", metadataSource: "deterministic" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
});

it("keeps caller-funded failures on the caller key even when operator keys are configured", async () => {
    const originalKey = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "operator-test-only";
    global.fetch = jest.fn(async () => new Response("Denied", { status: 401 })) as typeof fetch;
    try {
        expect(await analyzeRepository("example", "repo", tree, "", undefined, config)).toMatchObject({ source: "fallback" });
        const calls = jest.mocked(global.fetch).mock.calls;
        expect(calls).toHaveLength(2);
        for (const [, init] of calls) expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer caller-test-only");
    } finally {
        if (originalKey === undefined) delete process.env.AI_API_KEY;
        else process.env.AI_API_KEY = originalKey;
    }
});
