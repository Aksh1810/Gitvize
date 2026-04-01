import { NextRequest, NextResponse } from "next/server";
import { readCommitsPage } from "@/lib/local-git";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * GET /api/github/repo/commits?owner=X&repo=Y&page=N&per_page=100&sha=main
 *
 * Returns paginated commits from the local clone, avoiding GitHub API calls.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") ?? "100", 10), 100);
    const sha = searchParams.get("sha") ?? "main";

    if (!owner || !repo) {
        return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }
    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }

    try {
        const commits = await readCommitsPage(owner, repo, sha, page, perPage);
        return NextResponse.json(commits);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to read commits";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
