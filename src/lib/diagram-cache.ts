// ============================================================================
// GitViz — AI Diagram Cache (localStorage-based)
// ============================================================================
// Caches AI-generated architecture analysis per repo so that when
// credits are exhausted or the same repo is revisited, we serve
// the cached version instantly instead of using fallback heuristics.

import type { ArchitectureAnalysis, FileAnnotation } from "@/types";

const CACHE_KEY_PREFIX = "gitviz_diagram_cache:";
const MAX_CACHED_REPOS = 20; // evict oldest when exceeded

interface CachedDiagram {
    architecture: ArchitectureAnalysis;
    annotations: FileAnnotation[];
    cachedAt: string; // ISO timestamp
    source: "ai" | "fallback";
}

export interface DiagramCacheOpts {
    /** Short, stable identifier for the GitHub token in use. Cached entries written with
     *  one token are not returned for another (prevents cross-account stale reads). */
    tokenHash?: string | null;
    /** AI analysis mode. "smart" and "premium" produce different output and must not share. */
    mode?: "smart" | "premium";
}

function cacheKey(owner: string, repo: string, opts?: DiagramCacheOpts): string {
    const tokenPart = opts?.tokenHash ? opts.tokenHash : "anon";
    const modePart = opts?.mode ?? "smart";
    return `${CACHE_KEY_PREFIX}${owner}/${repo}|${tokenPart}|${modePart}`;
}

/** Store an AI-generated diagram in cache */
export function cacheDiagram(
    owner: string,
    repo: string,
    data: { architecture: ArchitectureAnalysis; annotations: FileAnnotation[] },
    source: "ai" | "fallback" = "ai",
    opts?: DiagramCacheOpts,
): void {
    if (typeof window === "undefined") return;
    try {
        const entry: CachedDiagram = {
            ...data,
            cachedAt: new Date().toISOString(),
            source,
        };
        localStorage.setItem(cacheKey(owner, repo, opts), JSON.stringify(entry));
        evictOldEntries();
    } catch {
        // localStorage full or unavailable — silently skip
    }
}

/** Retrieve a cached diagram, or null if none exists */
export function getCachedDiagram(
    owner: string,
    repo: string,
    opts?: DiagramCacheOpts,
): CachedDiagram | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(cacheKey(owner, repo, opts));
        if (!raw) return null;
        return JSON.parse(raw) as CachedDiagram;
    } catch {
        return null;
    }
}

/** Tiny synchronous string hash — good enough to bucket cache by token without
 *  exposing the token itself. Not cryptographic. */
export function hashToken(token: string | null | undefined): string {
    if (!token) return "anon";
    let h = 5381;
    for (let i = 0; i < token.length; i++) {
        h = ((h << 5) + h + token.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/** Evict oldest cached entries when over limit */
function evictOldEntries(): void {
    if (typeof window === "undefined") return;
    const entries: Array<{ key: string; cachedAt: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    entries.push({ key, cachedAt: parsed.cachedAt ?? "" });
                }
            } catch { /* skip */ }
        }
    }
    if (entries.length > MAX_CACHED_REPOS) {
        entries.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
        const toRemove = entries.slice(0, entries.length - MAX_CACHED_REPOS);
        toRemove.forEach((e) => localStorage.removeItem(e.key));
    }
}
