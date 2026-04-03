import { NextRequest } from "next/server";
import { fetchRepoMetadata, fetchMergedPRs } from "@/lib/github";
import { cloneRepo, fetchAllRepoDataLocal, detectDefaultBranch } from "@/lib/local-git";
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
 * Clone-first SSE stream. Emits:
 *   {"type":"checking","message":"..."}       — immediately, while firing background API calls
 *   {"type":"metadata","message":"..."}       — background GitHub metadata fetch started
 *   {"type":"cloning","message":"..."}        — clone / cache-reuse progress
 *   {"type":"reading","message":"..."}        — local data read progress
 *   {"type":"done","payload":{...repoData}}   — local data ready; dashboard can render
 *   {"type":"enriched","payload":{metadata,mergedPRs}} — GitHub API data ready; update stats
 *   {"type":"error","message":"..."}          — unrecoverable error
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const token = request.headers.get("x-github-token");

    if (!owner || !repo || !OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return new Response(
            sseEvent({ type: "error", message: "Invalid owner or repo" }),
            { status: 400, headers: { "Content-Type": "text/event-stream" } }
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(sseEvent(data)));
            };

            try {
                // Fire GitHub API calls immediately in background — parallel with clone.
                // These are best-effort; local data is emitted as soon as clone + read is done.
                emit({ type: "checking", message: "Preparing..." });
                const metadataPromise = fetchRepoMetadata(owner, repo, token).catch(() => null);
                const mergedPRsPromise = fetchMergedPRs(owner, repo, 1, token).catch(() => []);
                emit({ type: "metadata", message: "Fetching metadata in background..." });

                // Step 1: Clone (or reuse cached clone) — this is the heavy step.
                try {
                    await cloneRepo(
                        owner,
                        repo,
                        token ?? undefined,
                        (msg) => emit({ type: "cloning", message: msg }),
                    );
                } catch (cloneErr) {
                    const msg = cloneErr instanceof Error ? cloneErr.message : "";
                    const friendly =
                        /authentication|credentials|invalid.*token|could not read/i.test(msg)
                            ? "Authentication failed. The repository may be private — add a GitHub token."
                            : /not found|does not exist/i.test(msg)
                                ? "Repository not found. Check the owner and repo name."
                                : msg || "Failed to clone repository.";
                    emit({ type: "error", message: friendly });
                    controller.close();
                    return;
                }

                // Detect default branch from the local clone (no re-clone).
                const defaultBranch = await detectDefaultBranch(owner, repo, token).catch(() => "main");

                // Step 2: Read all data from local clone (clone is already done — just reads).
                const localData = await fetchAllRepoDataLocal(
                    owner,
                    repo,
                    defaultBranch,
                    token,
                    (msg) => emit({ type: "reading", message: msg }),
                );

                const contributors = deduplicateContributors(localData.contributors);

                // Build placeholder metadata from locally-known fields.
                // Enough for the dashboard to render immediately.
                const placeholderMetadata = {
                    owner,
                    repo,
                    fullName: `${owner}/${repo}`,
                    description: null as string | null,
                    stars: 0,
                    forks: 0,
                    watchers: 0,
                    openIssues: 0,
                    license: null as string | null,
                    topics: [] as string[],
                    language: null as string | null,
                    pushedAt: new Date().toISOString(),
                    defaultBranch,
                    htmlUrl: `https://github.com/${owner}/${repo}`,
                };

                // Emit done — dashboard renders immediately with local data.
                emit({
                    type: "done",
                    payload: {
                        metadata: placeholderMetadata,
                        ...localData,
                        contributors,
                        mergedPRs: [],
                    },
                });

                // Step 3: Resolve GitHub API data (already in-flight) and enrich the dashboard.
                const [metadata, mergedPRs] = await Promise.all([metadataPromise, mergedPRsPromise]);
                emit({
                    type: "enriched",
                    payload: {
                        metadata: metadata ?? placeholderMetadata,
                        mergedPRs,
                    },
                });
            } catch (err) {
                emit({
                    type: "error",
                    message: err instanceof Error ? err.message : "Failed to load repository",
                });
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
