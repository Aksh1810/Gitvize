import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysis } from "@/lib/ai";
import type { TreeItem } from "@/types";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { owner, repo, tree, readme } = body as {
            owner: string;
            repo: string;
            tree: TreeItem[];
            readme: string;
        };

        if (!owner || !repo || !tree) {
            return NextResponse.json(
                { error: "owner, repo, and tree are required" },
                { status: 400 }
            );
        }

        // Check if AI is configured
        const hasAI = !!process.env.AI_API_KEY;

        if (hasAI) {
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
                            }
                        );

                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    step: "enrich",
                                    status: "complete",
                                    message: "Analysis complete",
                                    data: result,
                                })}\n\n`
                            )
                        );

                        controller.close();
                    } catch (error) {
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
