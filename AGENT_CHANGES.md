## file-tree-graph: cosmos.gl → Sigma.js v3 + Graphology + ForceAtlas2 worker

### Why
cosmos.gl had recurring issues (drag/repulsion glitches, fitView timing, manual canvas label RAF loop, undocumented APIs). Migrated to Sigma.js v3 + Graphology + FA2 worker for a more mature, attribute-driven WebGL rendering stack with physics on a separate thread.

### Files changed
**`package.json`** — added `sigma`, `graphology`, `graphology-layout-forceatlas2`, devDep `graphology-types`. cosmos.gl entry left in place pending broader verification.

**`src/components/diagrams/file-tree-graph.tsx`** (only file touched in `src/`)
- Replaced cosmos.gl `Graph` import with `Sigma`, `Graph` (Graphology), and `FA2Layout` (worker).
- Removed `hexToRgba01`, `symbolKindToShape`, `buildCosmosArrays`, the SimNode-typed-array path, and the `<canvas>` label overlay + RAF loop.
- New `buildSigmaGraph()` — produces a Graphology graph with attrs `{x, y, size, color, baseColor, label, hidden, highlighted, type, symbolKind, path, ...}`. Concentric ring seed positions preserved.
- New `fa2SettingsFor(nodeCount)` — size-tuned ForceAtlas2 settings (scalingRatio, slowDown, barnesHutOptimize) with a `settleMs` stop-timer per repo size.
- `edgeTypeColor()` now returns rgba strings (Sigma reads CSS colors). All 7 edge types preserved (`contains`, `defines`, `imports`, `calls`, `extends`, `implements`, `fileImport`).
- Symbol kinds now render as colored circles (no shape distinction, per scoped decision); color still distinguishes kind.
- `applyVisibility` walks Graphology nodes/edges and sets `hidden` attributes; Sigma respects them natively. Filter panel, presets (Overview/Clusters/Full), and symbol-kind toggles wired through this.
- `applyHoverEffect`/`restoreColors` rewrite node/edge `color` attrs (Obsidian-style dim using `graph.forEachNeighbor`). Click locks focus via `lockedNodeIdRef`; `clickStage` clears.
- Node-click → existing inspector flow preserved (`setSelectedFile`, `setSymbolFocus`, `setShowExplorerInspector`).
- Explorer file click → `pathToIdRef` map → `camera.animate({x, y, ratio})`.
- Drag with FA2 reheat: `downNode` pins via `setNodeAttribute('highlighted', true)`, captures `mousemovebody` to write `x/y` (worker picks up next tick), `mouseup`/`mouseleave` unpin and re-stop.
- Zoom buttons: `camera.animatedZoom`/`animatedUnzoom`/`animatedReset`.
- Tab visibility: `layout.stop()` when hidden; `layout.start()` only if not yet settled.
- Cleanup: clear stop-timer, `layout.stop()` + `layout.kill()`, `sigma.kill()`. Camera state persisted in `savedCameraRef` across re-renders.

### Verification
- `npm install sigma graphology graphology-layout-forceatlas2` + `graphology-types` (devDep) — clean.
- `npm run build` — green (TypeScript + Next compile pass).
- `npm run lint` — no new issues introduced (pre-existing errors in `src/lib/github.ts`, `knowledge-graph.tsx`, etc. unchanged).
- Manual UI smoke-test: blocked by another `next dev` instance holding `.next/dev/lock`; needs to be terminated before re-running. Build + lint signals are clean — interactive verification (small repo render, large repo `facebook/react`, drag, presets, search, hover dim, explorer-click camera animation, tab-switch survival) recommended before removing cosmos.gl from `package.json`.

### Known scope-limited gaps
- Symbol-kind shape distinction (hexagon/square/diamond/triangle/pentagon) flattened to circles. Color still distinguishes kind.
- FA2 reheat-during-drag is less crisp than cosmos.gl's `setPointPositions` push.
- Sigma's built-in labels replace the canvas overlay; rendering is close but not pixel-identical.
- cosmos.gl entry left in `package.json` for safe rollback; remove in a follow-up commit after interactive verification.

---

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
