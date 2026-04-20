import { NextRequest, NextResponse } from "next/server";
import { fetchAllRepoData } from "@/lib/github";
import { checkRateLimit, getClientIp, scrubSecrets, rateLimitResponse } from "@/lib/rate-limit";
import type { Contributor } from "@/types";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

function deduplicateContributors(contributors: Contributor[]): Contributor[] {
    const merged = new Map<string, Contributor>();

    for (const c of contributors) {
        const key = c.login
            ? c.login.toLowerCase()
            : c.email
                ? c.email.toLowerCase()
                : c.name?.toLowerCase() ?? `id-${c.id}`;

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

    return Array.from(merged.values()).sort(
        (a, b) => b.contributions - a.contributions
    );
}

function extractStatusCode(errorMessage: string): number | null {
    const match = errorMessage.match(/GitHub API error\s+(\d{3})\s+/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`repo:${ip}`, 30, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    const token =
        request.headers.get("x-github-token") ??
        process.env.GITHUB_TOKEN ??
        null;

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
        data.contributors = deduplicateContributors(data.contributors ?? []);
        return NextResponse.json(data);
    } catch (error) {
        const raw =
            error instanceof Error ? error.message : "Failed to fetch repo data";
        const message = scrubSecrets(raw);
        const statusCode = extractStatusCode(message) ?? 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
