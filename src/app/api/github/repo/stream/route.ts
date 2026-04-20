import { NextRequest } from "next/server";
import { fetchAllRepoData } from "@/lib/github";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { Contributor } from "@/types";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

function deduplicateContributors(contributors: Contributor[]): Contributor[] {
    const merged = new Map<string, Contributor>();
    for (const c of contributors) {
        const key = c.login
            ? c.login.toLowerCase()
            : c.email ? c.email.toLowerCase() : `id-${c.id}`;
        const existing = merged.get(key);
        if (existing) {
            existing.contributions += c.contributions;
            if (!existing.htmlUrl && c.htmlUrl) {
                existing.htmlUrl = c.htmlUrl;
                existing.avatarUrl = c.avatarUrl;
                existing.login = c.login;
                existing.id = c.id;
            }
        } else {
            merged.set(key, { ...c });
        }
    }
    return Array.from(merged.values()).sort((a, b) => b.contributions - a.contributions);
}

function sseEvent(data: Record<string, unknown>): string {
    return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/github/repo/stream?owner=X&repo=Y
 *
 * GitHub-API-only SSE stream (no git binary, no filesystem writes).
 * Emits:
 *   {"type":"checking","message":"..."}   — immediately on connect
 *   {"type":"reading","message":"..."}    — while fetching from GitHub API
 *   {"type":"done","payload":{...}}       — all data ready; dashboard can render
 *   {"type":"error","message":"..."}      — unrecoverable error
 */
export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`stream:${ip}`, 20, 60_000);
    if (!rl.ok) {
        return new Response(
            sseEvent({ type: "error", message: "Too many requests. Please try again later." }),
            { status: 429, headers: { "Content-Type": "text/event-stream", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
        );
    }

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    // Prefer the user's PAT from the request; fall back to the server-side token.
    const token =
        request.headers.get("x-github-token") ??
        process.env.GITHUB_TOKEN ??
        null;

    if (!owner || !repo || !OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return new Response(
            sseEvent({ type: "error", message: "Invalid owner or repo" }),
            { status: 400, headers: { "Content-Type": "text/event-stream" } },
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(sseEvent(data)));
            };

            try {
                emit({ type: "checking", message: "Checking repository access..." });
                emit({ type: "reading", message: "Fetching repository data from GitHub..." });

                const data = await fetchAllRepoData(owner, repo, token);
                const contributors = deduplicateContributors(data.contributors);

                emit({
                    type: "done",
                    payload: {
                        ...data,
                        contributors,
                    },
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to load repository";
                const friendly =
                    /401|403|authentication|credentials|invalid.*token/i.test(msg)
                        ? "Authentication failed. The repository may be private — add a GitHub token."
                        : /404|not found|does not exist/i.test(msg)
                            ? "Repository not found. Check the owner and repo name."
                            : /rate limit/i.test(msg)
                                ? "GitHub API rate limit exceeded. Add a GitHub token for higher limits."
                                : msg;
                emit({ type: "error", message: friendly });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
