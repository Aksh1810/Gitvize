import { NextRequest, NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import { checkRateLimit, getClientIp, scrubSecrets, rateLimitResponse } from "@/lib/rate-limit";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * GET /api/github/repo/file?owner=X&repo=Y&path=src/index.ts
 *
 * Returns file content via the GitHub contents API.
 */
export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`file:${ip}`, 60, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const filePath = searchParams.get("path");

    const token =
        request.headers.get("x-github-token") ??
        process.env.GITHUB_TOKEN ??
        null;

    if (!owner || !repo || !filePath) {
        return NextResponse.json({ error: "owner, repo, and path are required" }, { status: 400 });
    }
    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }

    if (filePath.includes("..") || filePath.startsWith("/")) {
        return NextResponse.json({ error: "invalid file path" }, { status: 400 });
    }

    try {
        const content = await fetchFileContent(owner, repo, filePath, token);
        return new NextResponse(content, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    } catch (error) {
        const message = scrubSecrets(error instanceof Error ? error.message : "Failed to read file");
        const status = message.includes("not found") || message.includes("Not a file") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
