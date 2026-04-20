import { NextResponse } from "next/server";

// In-memory store — effective per process instance (single Node.js server or
// one Lambda container). For multi-instance deployments, replace with Redis.
const counters = new Map<string, { count: number; resetAt: number }>();

// Periodically purge expired entries to prevent unbounded growth.
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

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
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
