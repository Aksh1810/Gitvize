/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/analyze/route";
import { reserveServerAIAnalysis } from "@/lib/ai-budget";
import { analyzeRepository } from "@/lib/ai";

jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }), getClientIp: () => "unknown", scrubSecrets: (s: string) => s }));
jest.mock("@/lib/ai-budget", () => ({ reserveServerAIAnalysis: jest.fn() }));
jest.mock("@/lib/ai", () => ({
    getMockAnalysis: () => ({ architecture: {}, annotations: [] }),
    analyzeRepository: jest.fn(async () => ({ architecture: {}, annotations: [], source: "ai" })),
}));
const originalKey = process.env.AI_API_KEY;
beforeEach(() => { process.env.AI_API_KEY = "server-test-only"; jest.mocked(reserveServerAIAnalysis).mockResolvedValue("allowed"); });
afterAll(() => {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
});
const request = (extra = {}) => new NextRequest("http://localhost/api/analyze", { method: "POST",
    body: JSON.stringify({ owner: "example", repo: "repo", tree: [], readme: "", mode: "premium", ...extra }),
});

it.each([["exhausted", 429], ["unavailable", 503]] as const)("does not invoke AI when budget is %s", async (result, status) => {
    jest.mocked(reserveServerAIAnalysis).mockResolvedValue(result);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(analyzeRepository).not.toHaveBeenCalled();
});

it("waits for admission before spending server credentials", async () => {
    let release!: (value: "allowed") => void;
    jest.mocked(reserveServerAIAnalysis).mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = POST(request());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(analyzeRepository).not.toHaveBeenCalled();
    release("allowed");
    const response = await pending;
    await response.text();
    expect(analyzeRepository).toHaveBeenCalledTimes(1);
});

it.each([{ mode: "smart" }, { forceFallback: true }, { aiSettings: { provider: "openai", apiKey: "caller-test-only" } }])(
    "preserves non-server-funded behavior: %j", async extra => {
        jest.mocked(reserveServerAIAnalysis).mockResolvedValue("unavailable");
        const response = await POST(request(extra));
        expect(response.status).toBe(200);
        await response.text();
        expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
    },
);

it("does not debit malformed requests", async () => {
    expect((await POST(request({ repo: "invalid/repo" }))).status).toBe(400);
    expect(reserveServerAIAnalysis).not.toHaveBeenCalled();
});
