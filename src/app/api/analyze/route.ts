import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysis } from "@/lib/ai";
import { reserveServerAIAnalysis } from "@/lib/ai-budget";
import { checkRateLimit, getClientIp, scrubSecrets, rateLimitResponse } from "@/lib/rate-limit";
import type { AIConfig } from "@/lib/ai";
import { analysisTreeSchema, MAX_ANALYZE_README_CHARS, MAX_ANALYZE_REQUEST_BYTES } from "@/lib/analysis-contract";
import { readBoundedText, ResponseTooLargeError } from "@/lib/response-limits";
import { getDefaultAIModel, isAIProvider } from "@/lib/ai-model-config";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    // Shared rate limit for all analyze calls
    const rl = checkRateLimit(`analyze:${ip}`, 20, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    try {
        let input: unknown;
        try {
            input = JSON.parse(await readBoundedText(request, MAX_ANALYZE_REQUEST_BYTES));
        } catch (error) {
            return NextResponse.json({ error: error instanceof ResponseTooLargeError ? "Analysis request exceeds the 2 MiB limit" : "Invalid JSON body" }, {
                status: error instanceof ResponseTooLargeError ? 413 : 400,
            });
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) {
            return NextResponse.json({ error: "Analysis request must be an object" }, { status: 400 });
        }
        const body = input as Record<string, unknown>;
        const { owner, repo } = body;
        if (typeof owner !== "string" || typeof repo !== "string" || !OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
            return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
        }
        const treeResult = analysisTreeSchema.safeParse(body.tree);
        if (!treeResult.success) {
            return NextResponse.json({ error: "tree must contain at most 5000 valid path/type items (paths up to 4096 characters)" }, { status: 400 });
        }
        const tree = treeResult.data;
        const requestedMode = body.mode === undefined ? "smart" : body.mode;
        if (requestedMode !== "smart" && requestedMode !== "premium") {
            return NextResponse.json({ error: "invalid analysis mode" }, { status: 400 });
        }
        if (body.forceFallback !== undefined && typeof body.forceFallback !== "boolean") {
            return NextResponse.json({ error: "invalid forceFallback flag" }, { status: 400 });
        }

        // Smart mode is deterministic and does not call external AI APIs.
        if (requestedMode === "smart") {
            const result = getMockAnalysis(owner, repo, tree);
            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "smart",
                metadataSource: "deterministic",
                mode: "smart",
            });
        }

        if (body.forceFallback) {
            const result = getMockAnalysis(owner, repo, tree);
            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "fallback",
                metadataSource: "deterministic",
                mode: "premium",
            });
        }

        if (body.readme !== undefined && typeof body.readme !== "string") {
            return NextResponse.json({ error: "readme must be a string" }, { status: 400 });
        }
        if (body.readmeTruncated !== undefined && typeof body.readmeTruncated !== "boolean") {
            return NextResponse.json({ error: "invalid readmeTruncated flag" }, { status: 400 });
        }
        const fullReadme = (body.readme as string | undefined) ?? "";
        const readme = fullReadme.slice(0, MAX_ANALYZE_README_CHARS);
        const readmeTruncated = body.readmeTruncated === true || fullReadme.length > readme.length;
        let aiSettings: { provider: string; apiKey: string; model?: string } | undefined;
        if (body.aiSettings !== undefined) {
            if (!body.aiSettings || typeof body.aiSettings !== "object" || Array.isArray(body.aiSettings)) {
                return NextResponse.json({ error: "invalid AI settings" }, { status: 400 });
            }
            const settings = body.aiSettings as Record<string, unknown>;
            if (!isAIProvider(settings.provider)) {
                return NextResponse.json({ error: "invalid AI provider" }, { status: 400 });
            }
            if (typeof settings.apiKey !== "string" || !settings.apiKey.trim() || settings.apiKey.length > 300) {
                return NextResponse.json({ error: "invalid apiKey" }, { status: 400 });
            }
            if (settings.model !== undefined && (typeof settings.model !== "string" || !settings.model.trim() || settings.model.length > 100)) {
                return NextResponse.json({ error: "invalid model" }, { status: 400 });
            }
            aiSettings = { provider: settings.provider, apiKey: settings.apiKey.trim(), ...(typeof settings.model === "string" ? { model: settings.model.trim() } : {}) };
        }

        // Caller credentials never fall through to server-funded AI after validation failure.
        const clientKey = aiSettings?.apiKey;
        const hasAI = !!(clientKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.AI_API_KEY);

        if (requestedMode === "premium" && hasAI) {
            if (!clientKey) {
                const quota = await reserveServerAIAnalysis(ip);
                if (quota !== "allowed") {
                    return NextResponse.json(
                        { error: quota === "exhausted"
                            ? "Daily server AI budget reached. Try tomorrow or supply your own AI key."
                            : "Server AI budget unavailable. Supply your own AI key or try again later." },
                        { status: quota === "exhausted" ? 429 : 503 },
                    );
                }
            }
            // Build AI config from client settings (preferred) or env vars
            const aiConfig: AIConfig | undefined = clientKey
                ? {
                    provider: aiSettings!.provider,
                    apiKey: clientKey,
                    model: aiSettings!.model ?? getDefaultAIModel(aiSettings!.provider),
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
                                    message: `Ingested ${tree.length} repository items${readmeTruncated ? "; using a README excerpt" : ""}`,
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
                                    message: result.source === "pending"
                                        ? "AI diagram received; syntax validation pending"
                                        : `AI fallback: ${result.fallbackReason ?? "AI unavailable, using fallback diagram"}`,
                                    data: { ...result, mode: "premium", readmeTruncated },
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
                                        data: { ...fallback, source: "fallback", metadataSource: "deterministic", mode: "premium", readmeTruncated },
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
                metadataSource: "deterministic",
                mode: "premium",
                readmeTruncated,
                reason: "No premium AI key configured; showing smart diagram",
            });
        }
    } catch (error) {
        const message = scrubSecrets(error instanceof Error ? error.message : "Analysis failed");
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
