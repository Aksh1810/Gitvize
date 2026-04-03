import { NextRequest, NextResponse } from "next/server";
import { fetchRepoMetadata, fetchMergedPRs } from "@/lib/github";
import { fetchAllRepoDataLocal } from "@/lib/local-git";
import type { Contributor } from "@/types";

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/** Deduplicate contributors by login (case-insensitive), then email, then name. */
function deduplicateContributors(contributors: Contributor[]): Contributor[] {
    const merged = new Map<string, Contributor>();

    for (const c of contributors) {
        // Build a dedup key: prefer login (GitHub username), fall back to email, then name
        const key = c.login
            ? c.login.toLowerCase()
            : c.email
                ? c.email.toLowerCase()
                : c.name?.toLowerCase() ?? `id-${c.id}`;

        const existing = merged.get(key);
        if (existing) {
            existing.contributions += c.contributions;
            // Prefer entry with a GitHub profile (has htmlUrl or avatarUrl)
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
        const metadata = await fetchRepoMetadata(owner, repo, token);
        const localData = await fetchAllRepoDataLocal(owner, repo, metadata.defaultBranch, token);
        const mergedPRs = await fetchMergedPRs(owner, repo, 1, token).catch(() => []);

        const data = { metadata, ...localData, mergedPRs };
        data.contributors = deduplicateContributors(data.contributors ?? []);

        return NextResponse.json(data);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to fetch repo data";
        const statusCode = extractStatusCode(message) ?? 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
