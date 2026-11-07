import { z } from "zod";
import { architectureSchema } from "@/lib/analysis-contract";
import { repositorySnapshotKey, repositorySnapshotSchema } from "@/lib/repository-snapshot";
import type { ArchitectureAnalysis, FileAnnotation, RepositorySnapshot } from "@/types";

const CACHE_KEY_PREFIX = "gitviz_diagram_cache:v2:";
const MAX_CACHED_REPOS = 20;
const TTL_MS = 24 * 60 * 60 * 1000;
const versions = { schemaVersion: 2, generatorVersion: 1, promptVersion: 1 } as const;
const entrySchema = z.object({
    schemaVersion: z.literal(2), generatorVersion: z.literal(1), promptVersion: z.literal(1),
    snapshot: repositorySnapshotSchema,
    mode: z.enum(["smart", "premium"]), provider: z.string().max(256).nullable(), model: z.string().max(256).nullable(),
    architecture: architectureSchema,
    annotations: z.array(z.object({ path: z.string(), role: z.string(), description: z.string(), module: z.string() })),
    cachedAt: z.string().datetime(), source: z.enum(["ai", "fallback"]), metadataSource: z.enum(["ai", "deterministic"]),
}).strict();
export type CachedDiagram = Pick<z.infer<typeof entrySchema>, "architecture" | "annotations" | "cachedAt" | "source"> & { metadataSource?: "ai" | "deterministic" };
export interface DiagramCacheOpts {
    snapshot?: RepositorySnapshot;
    mode?: "smart" | "premium";
    provider?: string;
    model?: string;
}

function cacheKey(owner: string, repo: string, opts?: DiagramCacheOpts): string | null {
    const parsed = repositorySnapshotSchema.safeParse(opts?.snapshot);
    if (!parsed.success || parsed.data.status !== "ready" || parsed.data.visibility !== "public" || parsed.data.owner.toLowerCase() !== owner.toLowerCase() || parsed.data.repo.toLowerCase() !== repo.toLowerCase()) return null;
    // shortcut: skip persisted server-funded results until responses expose provider/model identity.
    if (!opts?.mode || (opts.mode === "premium" && (!opts.provider || !opts.model))) return null;
    return CACHE_KEY_PREFIX + JSON.stringify([versions, repositorySnapshotKey(parsed.data), opts.mode, opts.mode === "premium" ? opts.provider : null, opts.mode === "premium" ? opts.model : null]);
}

export function cacheDiagram(owner: string, repo: string, data: { architecture: ArchitectureAnalysis; annotations: FileAnnotation[]; metadataSource?: "ai" | "deterministic" }, source: "ai" | "fallback" = "ai", opts?: DiagramCacheOpts): void {
    if (typeof window === "undefined") return;
    removeLegacyEntries();
    const key = cacheKey(owner, repo, opts);
    if (!key) return; // Private results remain in the owning analysis session only.
    const entry = entrySchema.safeParse({ ...versions, ...data, snapshot: opts?.snapshot, mode: opts?.mode, provider: opts?.mode === "premium" ? opts.provider : null, model: opts?.mode === "premium" ? opts.model : null, source, metadataSource: data.metadataSource ?? "deterministic", cachedAt: new Date().toISOString() });
    if (!entry.success) return;
    try { localStorage.setItem(key, JSON.stringify(entry.data)); evictOldEntries(); } catch { /* Storage unavailable/full: retain the current session view. */ }
}

export function getCachedDiagram(owner: string, repo: string, opts?: DiagramCacheOpts): CachedDiagram | null {
    if (typeof window === "undefined") return null;
    removeLegacyEntries();
    const key = cacheKey(owner, repo, opts);
    if (!key) return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = entrySchema.safeParse(JSON.parse(raw));
        if (!parsed.success || cacheKey(owner, repo, { ...parsed.data, provider: parsed.data.provider ?? undefined, model: parsed.data.model ?? undefined }) !== key) return null;
        const age = Date.now() - Date.parse(parsed.data.cachedAt);
        if (age < 0 || age > TTL_MS) return null;
        return parsed.data;
    } catch { return null; }
}

function removeLegacyEntries(): void {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith("gitviz_diagram_cache:") && !key.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(key);
        }
    } catch { /* Storage unavailable: keep the current session view. */ }
}

function evictOldEntries(): void {
    const entries: Array<{ key: string; cachedAt: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(CACHE_KEY_PREFIX)) continue;
        try {
            const parsed = entrySchema.safeParse(JSON.parse(localStorage.getItem(key)!));
            entries.push({ key, cachedAt: parsed.success ? Date.parse(parsed.data.cachedAt) : 0 });
        } catch { entries.push({ key, cachedAt: 0 }); }
    }
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    for (const { key } of entries.slice(0, Math.max(0, entries.length - MAX_CACHED_REPOS))) localStorage.removeItem(key);
}
