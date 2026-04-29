## file-tree-graph: replace FA2 with d3-force for Obsidian-like physics

### Why
FA2 (ForceAtlas2) runs on a Web Worker — latency between ticks and rendering produces stiff, unresponsive physics. d3-force runs synchronously on the main thread, ticking each RAF frame before sigma.refresh(), giving instant force response and true Obsidian-style drag.

### Changes (`src/components/diagrams/file-tree-graph.tsx` only)
- **Imports** — removed `FA2Layout` import; added `Simulation`, `SimulationNodeDatum`, `SimulationLinkDatum` from `d3-force`.
- **`D3Node` / `D3Link` interfaces** — typed d3 simulation node/link objects (extend d3 datum types).
- **Refs** — replaced `layoutRef: FA2Layout` with `simRef: Simulation<D3Node,D3Link>` and `simNodesRef: Map<string,D3Node>` (needed for `fx/fy` access during drag).
- **`d3ChargeFor`** — per-nodeType repulsion: root −1200, folder −600, file −250, symbol −60.
- **`d3LinkDistance`** — per-edgeType spring distances: defines 40, fileImport 100, contains 120, others 80.
- **`restartLayout`** — builds `D3Node[]`/`D3Link[]` from current Graphology positions, creates d3 simulation with manyBody + link + center + collision forces, `alphaDecay(0.01)` + `alphaTarget(0.003)` (never fully stops), `stop()` to prevent d3's internal timer. RAF loop: `sim.tick()` → pin dragged node via `fx/fy` → write `x/y` back to Graphology → `sigma.refresh()`. Settle timer lowers `alphaTarget(0.001)` after N ms.
- **Drag** — on `downNode`: reheat sim to alpha 0.3; on `mousemovebody`: update `dragMousePosRef` only (RAF handles pin); on release: set `simNode.fx/fy = undefined` to unpin, cool `alphaTarget` back down.
- **Cleanup** — `simRef.current?.stop()` + `simNodesRef.current.clear()`.
- **Tab visibility** — on hidden: cancel RAF + `simRef.current?.stop()`; on visible: `restartLayout()`.

### Verification
- `npm run build` — clean.

---

## file-tree-graph: fix FA2 physics not animating (nodes static)

### Why
FA2Layout (Web Worker) writes updated positions to the Graphology graph, but Sigma does not automatically re-render when positions change — it requires explicit `sigma.refresh()` calls. Without a RAF loop, nodes appeared frozen even though FA2 was running.

### Changes (`src/components/diagrams/file-tree-graph.tsx` only)
- **`animFrameRef`** — new ref to track the active `requestAnimationFrame` ID for cleanup.
- **`restartLayout`** — added a RAF loop after `layout.start()`. The loop calls `sigmaRef.current?.refresh()` every frame while `layout.isRunning()`, then self-cancels when the layout stops. Also cancels existing RAF on entry to prevent double-loops.
- **`fa2SettingsFor`** — retuned for file trees: `gravity 0.5` (avoids collapsing), higher `scalingRatio` (more spread), lower `slowDown` for small graphs (visible movement sooner), added `linLogMode: false` and `strongGravityMode: false` explicitly.
- **Drag** — stop layout (+ cancel RAF) on `downNode` so FA2 doesn't fight the cursor. On `mousemovebody`, write `x/y` directly + manual `sigma.refresh()`. For folder nodes, move all neighbors by the same delta. On release (`mouseup`/`mouseleave`), call `restartLayout()` to reheat and re-settle.
- **Effect 1 cleanup** — added `cancelAnimationFrame(animFrameRef.current)` before killing sigma.
- **Tab visibility effect** — on hidden: cancel RAF + stop layout. On visible: call `restartLayout()` (kills old worker, creates new, starts RAF). Dep array updated to `[restartLayout]`.

### Verification
- `npm run build` — clean.

---

## file-tree-graph: fix graph re-initializing multiple times on load

### Why
The Sigma init `useEffect` had `[elements, applyHoverEffect, restoreColors]` deps. `elements` changes 3× during streaming (tree → symbolGraph worker → fileImportEdges worker), causing 3 full Sigma+FA2 teardown/recreate cycles with visible flash.

### Fix
Split into two effects:
- **Effect 1** (`[]` deps, runs once): creates the Graphology graph + Sigma instance, wires all event handlers. Seeds initial data from `elementsRef.current` if available when the dynamic import resolves.
- **Effect 2** (`[graphKey, elements, applyVisibility, restartLayout]` deps): incrementally syncs nodes/edges using `syncGraphData()` (preserves existing x/y positions), calls `applyVisibility()`, `sigma.refresh()`, and `restartLayout()`.
- **`graphKey`** useMemo: cheap fingerprint (`nodeCount|firstId|lastId|edgeCount`) that only changes when the node/edge set actually changes.
- **`elementsRef`**: keeps latest elements available to Effect 1's async init without being in its dep array.
- **`restartLayout`** useCallback (`[]` deps): kills old FA2 worker, creates new one from `graphRef.current`, starts it, sets stop timer. Used by both effects.
- **`syncGraphData`** module-level helper: adds/updates/drops nodes and edges incrementally; existing nodes keep their current `x`/`y` so layout positions survive data updates.

### Result
Sigma instance created once. Subsequent data arrivals do an in-place graph update + brief layout reheat — no flash, no camera reset.

### Verification
- `npm run build` — clean.

---

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
