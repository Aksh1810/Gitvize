import { createHash } from "node:crypto";
import { readBoundedText } from "@/lib/response-limits";

const GLOBAL_DAILY_LIMIT = 100;
const CLIENT_DAILY_LIMIT = 10;
const RESERVE = `
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[1]) or
   tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 0 end
for _, key in ipairs(KEYS) do
    redis.call('INCR', key)
    redis.call('EXPIRE', key, ARGV[3])
end
return 1`;

/** Spending admission must be shared, atomic and fail closed across instances. */
export async function reserveServerAIAnalysis(ip: string): Promise<"allowed" | "exhausted" | "unavailable"> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return "unavailable";
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const resetAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const ttl = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
    const key = `gitvize:ai-budget:${day}`;
    const client = createHash("sha256").update(ip).digest("hex");
    try {
        const response = await fetch(`${url}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([["EVAL", RESERVE, "2", `${key}:global`, `${key}:client:${client}`, GLOBAL_DAILY_LIMIT, CLIENT_DAILY_LIMIT, ttl]]),
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return "unavailable";
        const result = JSON.parse(await readBoundedText(response, 16 * 1024)) as Array<{ result?: unknown; error?: string }>;
        if (result.length !== 1 || result[0].error) return "unavailable";
        return result[0].result === 1 ? "allowed" : result[0].result === 0 ? "exhausted" : "unavailable";
    } catch {
        return "unavailable";
    }
}
