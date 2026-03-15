import { NextRequest, NextResponse } from "next/server";
import { fetchAllRepoData } from "@/lib/github";

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
    const tokenHeader = request.headers.get("x-github-token");
    const tokenQuery = searchParams.get("token");
    const token = tokenHeader || tokenQuery;

    if (!owner || !repo) {
        return NextResponse.json(
            { error: "owner and repo are required" },
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
