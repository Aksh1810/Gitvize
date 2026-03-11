import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysis } from "@/lib/ai";
import type { AIConfig } from "@/lib/ai";
import type { TreeItem } from "@/types";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { owner, repo, tree, readme, aiSettings } = body as {
            owner: string;
            repo: string;
            tree: TreeItem[];
            readme: string;
            aiSettings?: { provider: string; apiKey: string; model: string };
            forceFallback?: boolean;
        };

        const forceFallback = Boolean((body as { forceFallback?: boolean }).forceFallback);

        if (!owner || !repo || !tree) {
            return NextResponse.json(
                { error: "owner, repo, and tree are required" },
                { status: 400 }
            );
        }

        // Check if AI is configured — via client settings, GEMINI key, or generic env var
        const clientKey = aiSettings?.apiKey;
        const geminiKey = process.env.GEMINI_API_KEY;
        const geminiKeys = process.env.GEMINI_API_KEYS;
        const envKey = process.env.AI_API_KEY;
        const hasAI = !!(clientKey || geminiKey || geminiKeys || envKey);

        if (forceFallback) {
            const result = getMockAnalysis(owner, repo, tree);
            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "fallback",
            });
        }

        if (hasAI) {
            // Build AI config from client settings (preferred) or env vars
            const aiConfig: AIConfig | undefined = clientKey
                ? {
                    provider: aiSettings!.provider,
                    apiKey: clientKey,
                    model: aiSettings!.model,
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
                                    data: result,
                                })}\n\n`
                            )
                        );

                        controller.close();
                    } catch (error) {
                        console.error("AI analysis failed, falling back to mock:", error);
                        // Fall back to mock analysis when AI fails
                        try {
                            const fallback = getMockAnalysis(owner, repo, tree);
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        step: "enrich",
                                        status: "complete",
                                        message: `AI failed (${error instanceof Error ? error.message : "unknown error"}), using fallback diagram`,
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
                                        message:
                                            error instanceof Error
                                                ? error.message
                                                : "Analysis failed",
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
            // Mock analysis for development
            const result = getMockAnalysis(owner, repo, tree);

            return NextResponse.json({
                ...result,
                generatedAt: new Date().toISOString(),
                mock: true,
                source: "fallback",
            });
        }
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : "Analysis failed",
            },
            { status: 500 }
        );
    }
}
