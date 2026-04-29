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

function cacheKey(owner: string, repo: string): string {
    return `${CACHE_KEY_PREFIX}${owner}/${repo}`;
}

/** Store an AI-generated diagram in cache */
export function cacheDiagram(
    owner: string,
    repo: string,
    data: { architecture: ArchitectureAnalysis; annotations: FileAnnotation[] },
    source: "ai" | "fallback" = "ai"
): void {
    if (typeof window === "undefined") return;
    try {
        const entry: CachedDiagram = {
            ...data,
            cachedAt: new Date().toISOString(),
            source,
        };
        localStorage.setItem(cacheKey(owner, repo), JSON.stringify(entry));
        evictOldEntries();
    } catch {
        // localStorage full or unavailable — silently skip
    }
}

/** Retrieve a cached diagram, or null if none exists */
export function getCachedDiagram(
    owner: string,
    repo: string
): CachedDiagram | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(cacheKey(owner, repo));
        if (!raw) return null;
        return JSON.parse(raw) as CachedDiagram;
    } catch {
        return null;
    }
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
