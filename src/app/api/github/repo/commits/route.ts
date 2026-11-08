import { NextRequest, NextResponse } from "next/server";
import { fetchCommitsPage, GitHubApiError, GitHubRateLimitError, HistoryRequestError } from "@/lib/github";
import { gitShaSchema } from "@/lib/repository-snapshot";
import { MAX_HISTORY_PAGES } from "@/lib/branch-history";
import { checkRateLimit, getClientIp, scrubSecrets, rateLimitResponse } from "@/lib/rate-limit";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * GET /api/github/repo/commits?owner=X&repo=Y&page=N&per_page=100&sha=FULL_COMMIT_SHA
 *
 * Returns paginated commits via the GitHub REST API.
 */
export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`commits:${ip}`, 30, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const rawPage = searchParams.get("page") ?? "1";
    const page = Number(rawPage);
    const rawPerPage = searchParams.get("per_page") ?? "100";
    const perPage = Number(rawPerPage);
    const sha = searchParams.get("sha") ?? "";

    const token = request.headers.get("x-github-token");

    if (!owner || !repo) {
        return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }
    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }
    if (!gitShaSchema.safeParse(sha).success || !/^[1-9][0-9]*$/.test(rawPage) || !/^[1-9][0-9]*$/.test(rawPerPage) || page > MAX_HISTORY_PAGES || perPage > 100 || [...searchParams.keys()].some(key => !["owner", "repo", "sha", "page", "per_page"].includes(key)) || [...searchParams.keys()].some(key => searchParams.getAll(key).length !== 1)) {
        return NextResponse.json({ error: "invalid pinned sha or pagination" }, { status: 400 });
    }

    try {
        const historyPage = await fetchCommitsPage(owner, repo, sha, page, perPage, token, request.signal);
        return NextResponse.json(historyPage, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        const message = scrubSecrets(error instanceof Error ? error.message : "Failed to fetch commits");
        const cancelled = request.signal.aborted || (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError");
        const status = cancelled ? 499 : error instanceof GitHubApiError || error instanceof HistoryRequestError ? error.status : error instanceof GitHubRateLimitError ? 429 : 502;
        return NextResponse.json({ error: cancelled ? "History request cancelled" : message }, { status, headers: { "Cache-Control": "private, no-store", ...(error instanceof GitHubRateLimitError && error.retryAfter !== undefined ? { "Retry-After": String(error.retryAfter) } : {}) } });
    }
}
