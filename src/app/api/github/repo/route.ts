import { NextRequest, NextResponse } from "next/server";
import { fetchAllRepoData } from "@/lib/github";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

function extractStatusCode(errorMessage: string): number | null {
    const match = errorMessage.match(/GitHub API error\s+(\d{3})\s+/i);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const token = request.headers.get("x-github-token");

    if (!owner || !repo) {
        return NextResponse.json(
            { error: "owner and repo are required" },
            { status: 400 }
        );
    }

    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json(
            { error: "invalid owner or repo format" },
            { status: 400 }
        );
    }

    try {
        const data = await fetchAllRepoData(owner, repo, token);
        return NextResponse.json(data);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to fetch repo data";
        const statusCode = extractStatusCode(message) ?? 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
