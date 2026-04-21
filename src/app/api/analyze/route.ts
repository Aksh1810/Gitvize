import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysis } from "@/lib/ai";
import { checkRateLimit, getClientIp, scrubSecrets, rateLimitResponse } from "@/lib/rate-limit";
import type { AIConfig } from "@/lib/ai";
import type { TreeItem } from "@/types";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const ALLOWED_PROVIDERS = new Set(["gemini", "anthropic", "openai"]);
const MAX_README_LEN = 50_000;
const MAX_TREE_ITEMS = 5_000;

export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`analyze:${ip}`, 60, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    try {
        const body = await request.json();
        const { owner, repo, tree, readme, aiSettings, mode } = body as {
            owner: string;
            repo: string;
            tree: TreeItem[];
            readme: string;
            aiSettings?: { provider: string; apiKey: string; model?: string };
            forceFallback?: boolean;
            mode?: "smart" | "premium";
        };

        const forceFallback = Boolean((body as { forceFallback?: boolean }).forceFallback);
        const requestedMode = mode ?? "smart";

        if (!owner || !repo || !tree) {
            return NextResponse.json(
                { error: "owner, repo, and tree are required" },
                { status: 400 }
            );
        }

        if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
            return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
        }

        if (!Array.isArray(tree) || tree.length > MAX_TREE_ITEMS) {
            return NextResponse.json({ error: `tree must be an array with at most ${MAX_TREE_ITEMS} items` }, { status: 400 });
        }

        if (typeof readme === "string" && readme.length > MAX_README_LEN) {
            return NextResponse.json({ error: "readme exceeds maximum length" }, { status: 400 });
        }

        if (aiSettings) {
            if (typeof aiSettings.provider !== "string" || !ALLOWED_PROVIDERS.has(aiSettings.provider)) {
                return NextResponse.json({ error: "invalid AI provider" }, { status: 400 });
            }
            if (typeof aiSettings.apiKey !== "string" || aiSettings.apiKey.length > 300) {
                return NextResponse.json({ error: "invalid apiKey" }, { status: 400 });
            }
            if (aiSettings.model !== undefined && (typeof aiSettings.model !== "string" || aiSettings.model.length > 100)) {
                return NextResponse.json({ error: "invalid model" }, { status: 400 });
            }
        }

        // Check if AI is configured — via client settings, GEMINI key, or generic env var
        const clientKey = aiSettings?.apiKey;
        const geminiKey = process.env.GEMINI_API_KEY;
        const geminiKeys = process.env.GEMINI_API_KEYS;
        const envKey = process.env.AI_API_KEY;
        const hasAI = !!(clientKey || geminiKey || geminiKeys || envKey);

        // Smart mode is deterministic and does not call external AI APIs.
        if (requestedMode === "smart") {
            const result = getMockAnalysis(owner, repo, tree);
            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "smart",
                mode: "smart",
            });
        }

        if (forceFallback) {
            const result = getMockAnalysis(owner, repo, tree);
            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "fallback",
                mode: "premium",
            });
        }

        if (requestedMode === "premium" && hasAI) {
            // Build AI config from client settings (preferred) or env vars
            const aiConfig: AIConfig | undefined = clientKey
                ? {
                    provider: aiSettings!.provider,
                    apiKey: clientKey,
                    model: aiSettings!.model ?? (aiSettings!.provider === "gemini"
                        ? "gemini-2.5-flash"
                        : aiSettings!.provider === "anthropic"
                            ? "claude-3-5-sonnet-20241022"
                            : "gpt-4o-mini"),
                }
                : undefined; // will use env var defaults

            // Stream AI analysis via SSE
            const { analyzeRepository } = await import("@/lib/ai");

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        // Step 1: Ingest
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    step: "ingest",
                                    status: "complete",
                                    message: `Ingested ${tree.length} files`,
                                })}\n\n`
                            )
                        );

                        // Step 2 & 3: Understand + Enrich
                        const result = await analyzeRepository(
                            owner,
                            repo,
                            tree,
                            readme,
                            (step, message) => {
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify({
                                            step,
                                            status: "running",
                                            message,
                                        })}\n\n`
                                    )
                                );
                            },
                            aiConfig
                        );

                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    step: "enrich",
                                    status: "complete",
                                    message: result.source === "ai"
                                        ? "Analysis complete"
                                        : `AI fallback: ${result.fallbackReason ?? "AI unavailable, using fallback diagram"}`,
                                    data: { ...result, mode: "premium" },
                                })}\n\n`
                            )
                        );

                        controller.close();
                    } catch (error) {
                        const rawMsg = error instanceof Error ? error.message : "unknown error";
                        console.error("AI analysis failed, falling back to mock:", scrubSecrets(rawMsg));
                        // Fall back to mock analysis when AI fails
                        try {
                            const fallback = getMockAnalysis(owner, repo, tree);
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        step: "enrich",
                                        status: "complete",
                                        message: "AI analysis failed, using fallback diagram",
                                        data: fallback,
                                    })}\n\n`
                                )
                            );
                        } catch {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        step: "error",
                                        status: "error",
                                        message: "Analysis failed",
                                    })}\n\n`
                                )
                            );
                        }
                        controller.close();
                    }
                },
            });

            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        } else {
            // Premium requested but no key configured: return deterministic smart result.
            const result = getMockAnalysis(owner, repo, tree);

            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "fallback",
                mode: "premium",
                reason: "No premium AI key configured; showing smart diagram",
            });
        }
    } catch (error) {
        const message = scrubSecrets(error instanceof Error ? error.message : "Analysis failed");
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
