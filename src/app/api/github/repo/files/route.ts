import { NextRequest, NextResponse } from "next/server";
import { MAX_FILE_BATCH_PATHS } from "@/lib/file-batch";
import { fetchFileContent } from "@/lib/github";
import { FILE_BATCH_CONCURRENCY, MAX_BATCH_BYTES } from "@/lib/response-limits";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

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
    const rl = checkRateLimit(`files:${ip}`, 10, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);
    // Global cross-IP cap: prevents coordinated abuse from many IPs
    const globalRl = checkRateLimit("files:global", 200, 60_000);
    if (!globalRl.ok) return rateLimitResponse(globalRl.resetAt);

    let body: { owner?: unknown; repo?: unknown; paths?: unknown };
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

    const files: Array<{ path: string; content: string }> = [];
    let responseBytes = Buffer.byteLength(JSON.stringify({ files: [] }), "utf8");
    for (let offset = 0; offset < validPaths.length; offset += FILE_BATCH_CONCURRENCY) {
        const results = await Promise.all(validPaths.slice(offset, offset + FILE_BATCH_CONCURRENCY).map(async (filePath) => {
            try {
                const content = await fetchFileContent(owner, repo, filePath, token);
                return { path: filePath, content };
            } catch {
                return null;
            }
        }));
        for (const file of results) {
            if (!file) continue;
            responseBytes += Buffer.byteLength(JSON.stringify(file), "utf8") + (files.length ? 1 : 0);
            if (responseBytes > MAX_BATCH_BYTES) {
                return NextResponse.json({ error: "Batch exceeds maximum allowed size" }, { status: 413 });
            }
            files.push(file);
        }
    }
    return NextResponse.json({ files });
}
