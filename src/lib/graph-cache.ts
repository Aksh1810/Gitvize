// Tiny Upstash REST wrapper for caching server-computed FA2 seed layouts.
// Reuses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN already wired for
// rate limiting (src/lib/rate-limit.ts). No-ops gracefully without env vars.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

export type SeedPositions = Record<string, [number, number]>;

export async function getCachedSeed(key: string): Promise<SeedPositions | null> {
    if (!ENABLED) return null;
    try {
        const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { result: string | null };
        if (!data.result) return null;
        return JSON.parse(data.result) as SeedPositions;
    } catch {
        return null;
    }
}

export async function setCachedSeed(
    key: string,
    payload: SeedPositions,
    ttlSec: number,
): Promise<void> {
    if (!ENABLED) return;
    try {
        await fetch(`${UPSTASH_URL}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify([
                ["SET", key, JSON.stringify(payload), "EX", ttlSec],
            ]),
            cache: "no-store",
        });
    } catch {
        // ignore — cache is best-effort
    }
}
