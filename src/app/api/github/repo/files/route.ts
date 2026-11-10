import { NextRequest, NextResponse } from "next/server";
import { MAX_FILE_BATCH_PATHS } from "@/lib/file-batch";
import { authorizeRepositoryRead, readFileAtSnapshot, GitHubApiError, GitHubRateLimitError } from "@/lib/github";
import { FILE_BATCH_CONCURRENCY, MAX_BATCH_BYTES, ResponseTooLargeError } from "@/lib/response-limits";
import { parseRepositorySnapshot, RepositorySnapshotError } from "@/lib/repository-snapshot";
import { checkRateLimit, getClientIp, rateLimitResponse, scrubSecrets } from "@/lib/rate-limit";

import { sectionError } from "@/lib/section-result";
import type { FilePathOutcome } from "@/types";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * POST /api/github/repo/files
 * Body: { owner, repo, snapshot, paths: string[] }
 *
 * Batch file content endpoint — fetches all requested files from the GitHub
 * contents API in one request instead of one HTTP round-trip per file.
 * Returns: { files: Array<{ path: string; content: string }> }
 * Preserve successful files and distinguish failed paths from successful empty content.
 */
export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`files:${ip}`, 10, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);
    // Global cross-IP cap: prevents coordinated abuse from many IPs
    const globalRl = checkRateLimit("files:global", 200, 60_000);
    if (!globalRl.ok) return rateLimitResponse(globalRl.resetAt);

    let body: { owner?: unknown; repo?: unknown; paths?: unknown; snapshot?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const owner = typeof body.owner === "string" ? body.owner : null;
    const repo = typeof body.repo === "string" ? body.repo : null;
    const paths = Array.isArray(body.paths) ? body.paths : null;

    const token = request.headers.get("x-github-token");

    if (!owner || !repo || !paths) {
        return NextResponse.json({ error: "owner, repo, and paths are required" }, { status: 400 });
    }
    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }
    if (paths.length > MAX_FILE_BATCH_PATHS) {
        return NextResponse.json({ error: `too many paths (max ${MAX_FILE_BATCH_PATHS})` }, { status: 400 });
    }

    const validPaths = [...new Set(paths.filter(
        (p): p is string =>
            typeof p === "string" &&
            p.length > 0 &&
            p.length <= 4096 &&
            !p.includes("..") &&
            !p.startsWith("/"),
    ))];

    try {
        request.signal.throwIfAborted();
        const snapshot = parseRepositorySnapshot(body.snapshot, owner, repo);
        if (paths.length && !validPaths.length) return NextResponse.json({ error: "invalid file paths" }, { status: 400 });
        const context = await authorizeRepositoryRead(owner, repo, token, request.signal);
        const files: Array<{ path: string; content: string }> = [];
        const outcomes: FilePathOutcome[] = [];
        const errors: Array<{ path: string; status: number; error: string }> = [];
        for (let offset = 0; offset < validPaths.length; offset += FILE_BATCH_CONCURRENCY) {
            request.signal.throwIfAborted();
            const results = await Promise.all(validPaths.slice(offset, offset + FILE_BATCH_CONCURRENCY).map(async path => {
                try { return { file: { path, content: await readFileAtSnapshot(context, snapshot, path, request.signal) } }; }
                catch (error) {
                    request.signal.throwIfAborted();
                    if (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
                    const status = error instanceof GitHubApiError ? error.status : error instanceof GitHubRateLimitError ? 429 : error instanceof ResponseTooLargeError ? 413 : error instanceof RepositorySnapshotError ? 400 : 502;
                    return { failure: { path, status, error: sectionError(status, "Pinned file", error instanceof GitHubRateLimitError ? error.retryAfter : undefined) } };
                }
            }));
            request.signal.throwIfAborted();
            for (const result of results) {
                if (result.file) {
                    files.push(result.file);
                    outcomes.push({ path: result.file.path, status: "ready" });
                } else if (result.failure) {
                    outcomes.push({ path: result.failure.path, status: "error", error: result.failure.error });
                    errors.push({ path: result.failure.path, status: result.failure.status, error: result.failure.error.message });
                }
            }
            if (Buffer.byteLength(JSON.stringify({ files, errors, outcomes }), "utf8") > MAX_BATCH_BYTES) return NextResponse.json({ error: "Batch exceeds maximum allowed size" }, { status: 413, headers: { "Cache-Control": "private, no-store" } });
        }
        const failure = !files.length ? errors[0] : undefined;
        return NextResponse.json({ files, errors, outcomes, ...(failure ? { error: failure.error } : {}) }, { status: failure?.status ?? 200, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        const cancelled = request.signal.aborted || (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError");
        const status = cancelled ? 499 : error instanceof RepositorySnapshotError ? 400 : error instanceof GitHubApiError ? error.status : error instanceof GitHubRateLimitError ? 429 : 502;
        return NextResponse.json({ error: cancelled ? "File batch cancelled" : scrubSecrets(error instanceof Error ? error.message : "File batch unavailable") }, { status, headers: { "Cache-Control": "private, no-store", ...(error instanceof GitHubRateLimitError && error.retryAfter !== undefined ? { "Retry-After": String(error.retryAfter) } : {}) } });
    }
}
