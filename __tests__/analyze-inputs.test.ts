/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/analyze/route";
import { analyzeRepository } from "@/lib/ai";
import { reserveServerAIAnalysis } from "@/lib/ai-budget";

jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "test", scrubSecrets: (s: string) => s }));
jest.mock("@/lib/ai-budget", () => ({ reserveServerAIAnalysis: jest.fn() }));
jest.mock("@/lib/ai", () => ({
    getMockAnalysis: () => ({ architecture: { description: "Smart diagram" }, annotations: [] }),
    analyzeRepository: jest.fn(async () => ({ architecture: { description: "Provider diagram" }, annotations: [], source: "pending", metadataSource: "ai" })),
}));
const base = { owner: "example", repo: "repo", tree: [{ path: "src/index.ts", type: "blob" }], mode: "smart" };
const request = (extra: object = {}) => new NextRequest("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ ...base, ...extra }) });

it("accepts a long README and irrelevant invalid AI settings in deterministic Smart mode", async () => {
    const response = await POST(request({ readme: "x".repeat(50_001), aiSettings: { provider: "invalid" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "smart", metadataSource: "deterministic" });
    expect(analyzeRepository).not.toHaveBeenCalled();
    expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
});

it.each([null, [], "text", { ...base, owner: 123 }, { ...base, repo: ["repo"] }, { ...base, tree: [null] }, { ...base, tree: [{ path: 123, type: "blob" }] }, { ...base, tree: [{ path: "file.ts", type: "unknown" }] }, { ...base, tree: [{ path: "x".repeat(4097), type: "blob" }] }])("rejects malformed relevant request shapes with 400: %j", async body => {
    const response = await POST(new NextRequest("http://localhost/api/analyze", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
});

it("returns 400 for malformed JSON", async () => {
    const response = await POST(new NextRequest("http://localhost/api/analyze", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
});

it.each([undefined, "1"])("rejects actual request bytes before JSON parsing with Content-Length %s", async length => {
    const cancel = jest.fn();
    let pulls = 0;
    const body = new ReadableStream({ pull(controller) {
        if (pulls++ === 12) { controller.close(); return; }
        controller.enqueue(new Uint8Array(256 * 1024).fill(120));
    }, cancel });
    const headers = new Headers();
    if (length) headers.set("content-length", length);
    const init = { method: "POST", body, duplex: "half" as const, headers };
    const req = new NextRequest("http://localhost/api/analyze", init);
    const response = await POST(req);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(analyzeRepository).not.toHaveBeenCalled();
});

it("bounds a tiny tree request with an oversized extra field", async () => {
    const response = await POST(request({ ignored: "x".repeat(2 * 1024 * 1024) }));
    expect(response.status).toBe(413);
    expect(analyzeRepository).not.toHaveBeenCalled();
});

it("accepts a valid request exactly at the 2 MiB byte boundary", async () => {
    const empty = JSON.stringify({ ...base, ignored: "" });
    const body = JSON.stringify({ ...base, ignored: "x".repeat(2 * 1024 * 1024 - Buffer.byteLength(empty, "utf8")) });
    const response = await POST(new NextRequest("http://localhost/api/analyze", { method: "POST", body }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "smart", metadataSource: "deterministic" });
});

it.each([null, {}, [], { provider: "openai", apiKey: "" }, { provider: "openai", apiKey: "   " }, { provider: "invalid", apiKey: "caller-test-only" }])("does not inherit operator credentials for invalid caller settings: %j", async aiSettings => {
    const originalKey = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "operator-test-only";
    try {
        const response = await POST(request({ mode: "premium", aiSettings }));
        expect(response.status).toBe(400);
        expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
        expect(analyzeRepository).not.toHaveBeenCalled();
    } finally {
        if (originalKey === undefined) delete process.env.AI_API_KEY;
        else process.env.AI_API_KEY = originalKey;
    }
});

it.each([null, 123, [], {}])("rejects a non-string Premium README before provider/admission: %j", async readme => {
    const response = await POST(request({ mode: "premium", readme }));
    expect(response.status).toBe(400);
    expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
    expect(analyzeRepository).not.toHaveBeenCalled();
});

it("trims the Premium README excerpt and reports that it was trimmed", async () => {
    const response = await POST(request({ mode: "premium", readme: "é".repeat(50_001), aiSettings: { provider: "openai", apiKey: "caller-test-only" } }));
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n\n").map(line => JSON.parse(line.slice(6)));
    expect(analyzeRepository).toHaveBeenCalledWith("example", "repo", expect.any(Array), "é".repeat(50_000), expect.any(Function), expect.objectContaining({ apiKey: "caller-test-only" }));
    expect(events.at(-1).data).toMatchObject({ source: "pending", readmeTruncated: true });
    expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
});

it("includes explicit fallback provenance after an unexpected pipeline exception", async () => {
    jest.mocked(analyzeRepository).mockRejectedValueOnce(new Error("provider failure"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
        const response = await POST(request({ mode: "premium", aiSettings: { provider: "openai", apiKey: "caller-test-only" } }));
        const events = (await response.text()).trim().split("\n\n").map(line => JSON.parse(line.slice(6)));
        expect(events.at(-1).data).toMatchObject({ source: "fallback", metadataSource: "deterministic" });
    } finally { spy.mockRestore(); }
});
