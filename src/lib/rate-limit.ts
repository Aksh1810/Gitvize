import { NextResponse } from "next/server";

// ── In-process fallback store ──────────────────────────────────────────────
// Effective per Lambda instance. For multi-instance deployments, set
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable distributed
// rate limiting via the Upstash REST API (no npm package required).
const counters = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (entry.resetAt <= now) counters.delete(key);
  }
}, 60_000);

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

function checkRateLimitSync(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = counters.get(key);

  if (!entry || entry.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ── Distributed rate limiting via Upstash Redis REST API ──────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function checkRateLimitRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `rl:${key}`;
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSec, "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
  const data = await res.json() as Array<{ result: number }>;
  const count = data[0].result;
  const resetAt = Date.now() + windowMs;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

// ── Public API ─────────────────────────────────────────────────────────────
// Synchronous in-memory check (always). When Redis env vars are configured,
// also fires an async Redis increment for cross-instance tracking — the result
// is used to update a local Redis-backed counter on the NEXT request for this
// key. This gives eventual consistency without making every hot path async.
const redisOverrides = new Map<string, { blocked: boolean; expiresAt: number }>();

if (USE_REDIS) {
  // Periodically flush expired Redis-derived overrides
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of redisOverrides) {
      if (v.expiresAt <= now) redisOverrides.delete(k);
    }
  }, 30_000);
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  // Check Redis-derived override from a previous async call
  const override = redisOverrides.get(key);
  if (override && override.expiresAt > Date.now() && override.blocked) {
    return { ok: false, remaining: 0, resetAt: override.expiresAt };
  }

  const result = checkRateLimitSync(key, limit, windowMs);

  // Async Redis increment — updates override for next request
  if (USE_REDIS) {
    checkRateLimitRedis(key, limit, windowMs)
      .then((r) => {
        if (!r.ok) redisOverrides.set(key, { blocked: true, expiresAt: r.resetAt });
      })
      .catch(() => {});
  }

  return result;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Remove known token patterns before returning errors to clients or logging. */
export function scrubSecrets(message: string): string {
  return message
    .replace(/ghp_[A-Za-z0-9]{10,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{10,}/g, "[REDACTED]")
    .replace(/ghs_[A-Za-z0-9]{10,}/g, "[REDACTED]")
    .replace(/gho_[A-Za-z0-9]{10,}/g, "[REDACTED]")
    .replace(/AIza[A-Za-z0-9_\-]{30,}/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED]");
}

export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Limit": "0",
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
