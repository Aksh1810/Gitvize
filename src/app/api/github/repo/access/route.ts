import { NextRequest, NextResponse } from "next/server";
import { checkRepoAccess } from "@/lib/github";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`access:${ip}`, 60, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const token = request.headers.get("x-github-token");

    if (!owner || !repo) {
        return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }

    if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "invalid owner or repo format" }, { status: 400 });
    }

    const access = await checkRepoAccess(owner, repo, token);

    if (!access.ok) {
        return NextResponse.json(
            {
                ok: false,
                needsAuth: access.status === 404,
                status: access.status,
            },
            { status: access.status }
        );
    }

    return NextResponse.json({
        ok: true,
        isPrivate: access.isPrivate,
        fullName: access.fullName,
    });
}
