import { NextRequest, NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const MAX_PATHS = 200;

/**
 * POST /api/github/repo/files
 * Body: { owner, repo, paths: string[] }
 *
 * Batch file content endpoint — fetches all requested files from the GitHub
 * contents API in one request instead of one HTTP round-trip per file.
 * Returns: { files: Array<{ path: string; content: string }> }
 * Files that fail to read are silently omitted from the response.
 */
export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`files:${ip}`, 30, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    let body: { owner?: unknown; repo?: unknown; paths?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const owner = typeof body.owner === "string" ? body.owner : null;
    const repo = typeof body.repo === "string" ? body.repo : null;
    const paths = Array.isArray(body.paths) ? body.paths : null;

    const token =
        request.headers.get("x-github-token") ??
        process.env.GITHUB_TOKEN ??
        null;

    if (!owner || !repo || !paths) {
        return NextResponse.json({ error: "owner, repo, and paths are required" }, { status: 400 });
    }
    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }
    if (paths.length > MAX_PATHS) {
        return NextResponse.json({ error: `too many paths (max ${MAX_PATHS})` }, { status: 400 });
    }

    const validPaths = paths.filter(
        (p): p is string =>
            typeof p === "string" &&
            p.length > 0 &&
            !p.includes("..") &&
            !p.startsWith("/"),
    );

    const results = await Promise.all(
        validPaths.map(async (filePath) => {
            try {
                const content = await fetchFileContent(owner, repo, filePath, token);
                return { path: filePath, content };
            } catch {
                return null;
            }
        }),
    );

    const files = results.filter((r): r is { path: string; content: string } => r !== null);
    return NextResponse.json({ files });
}
