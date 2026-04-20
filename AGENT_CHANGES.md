## security

### Files changed

**`src/lib/rate-limit.ts`** (new)
- In-memory sliding-window rate limiter (`checkRateLimit`) keyed by `{endpoint}:{ip}`
- `getClientIp` extracts real IP from `x-forwarded-for` / `x-real-ip`
- `scrubSecrets` strips GitHub token patterns (`ghp_`, `github_pat_`, `ghs_`, `gho_`) and AI key patterns (`AIza…`, `sk-…`) from strings before they reach client responses or logs
- `rateLimitResponse` returns a standard 429 JSON response with `Retry-After` header

**`src/proxy.ts`** (new — replaces Next.js middleware)
- Added security headers on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- Uses `proxy` export (Next.js 16 convention, `middleware` is deprecated)

**`src/app/api/github/repo/route.ts`**
- Added rate limiting: 30 req/min per IP
- `scrubSecrets()` applied to error message before returning to client

**`src/app/api/github/repo/access/route.ts`**
- Added rate limiting: 60 req/min per IP

**`src/app/api/github/repo/stream/route.ts`**
- Added rate limiting: 20 req/min per IP; 429 returned as SSE error event with `Retry-After` header

**`src/app/api/github/repo/commits/route.ts`**
- Added rate limiting: 30 req/min per IP
- Added `SHA_PATTERN` validation for the `sha` query param (branch names / commit SHAs) — previously unvalidated, potential injection vector
- `scrubSecrets()` applied to error message

**`src/app/api/github/repo/file/route.ts`**
- Added rate limiting: 60 req/min per IP
- `scrubSecrets()` applied to error message

**`src/app/api/github/repo/files/route.ts`**
- Added rate limiting: 30 req/min per IP

**`src/app/api/analyze/route.ts`**
- Added rate limiting: 20 req/min per IP
- Added `OWNER_PATTERN` / `REPO_PATTERN` validation (was completely missing)
- Added `MAX_TREE_ITEMS` (5000) and `MAX_README_LEN` (50 000 chars) input limits
- Added `aiSettings` validation: provider must be `gemini | anthropic | openai`, apiKey ≤ 300 chars, model ≤ 100 chars
- `scrubSecrets()` applied before `console.error` in SSE stream error path
- SSE error messages now return generic strings instead of raw error messages (prevents leaking AI API keys)
- Outer catch block scrubs error before returning JSON response
