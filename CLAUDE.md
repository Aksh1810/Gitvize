# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ultra-dark, neon-glassmorphism GitHub repository visualization dashboard. Displays git history, file trees, contributors, dependencies, and AI analysis as interactive graphs.

**Stack:** Next.js 16.1.6 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4

## Build & Dev Commands

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build — run after every significant change
npm run lint       # ESLint check
```

Always run `npm run build` to verify TypeScript correctness before considering a task done. The dev server does not catch all type errors.

## Architecture

### Routing
- `/` — Landing page (`src/app/page.tsx`)
- `/[owner]/[repo]` — Dashboard (`src/app/[owner]/[repo]/repo-page-client.tsx`) — main state hub
- `/api/github/repo` — All GitHub data fetching (`src/app/api/github/repo/route.ts`)
- `/api/github/repo/access` — Pre-flight repo accessibility check (public/private, 404) (`src/app/api/github/repo/access/route.ts`)
- `/api/analyze` — AI analysis endpoint (`src/app/api/analyze/route.ts`)

### Data Flow
1. `repo-page-client.tsx` calls `/api/github/repo?owner=&repo=&token=`
2. API route calls `fetchAllRepoData()` from `src/lib/github.ts` via `Promise.all`
3. Data flows down as props to diagram components
4. GitHub PAT stored in `localStorage` as `gitviz_github_pat`
5. Rate limit: catch 403/429 → set `rateLimitHit` → show banner

### Diagram Components (`src/components/diagrams/`)
| File | Graph Library | Layout |
|------|--------------|--------|
| `file-tree-graph.tsx` | Cytoscape.js + `cytoscape-fcose` | fcose force layout |
| `architecture-diagram.tsx` | React Flow (`@xyflow/react`) | dagre |
| `contributors-network.tsx` | Cytoscape.js | Concentric rings |
| `branch-graph.tsx` | Custom HTML timeline | — |
| `merge-graph.tsx` | Custom HTML timeline | — |
| `dependency-graph.tsx` | React Flow | dagre |
| `knowledge-graph.tsx` | Custom Canvas/WebGL (no lib) | `src/lib/force-layout.ts` |
| `commit-history-rail.tsx` | Custom HTML | — |
| `git-rail-graph.tsx` | Custom HTML | — |
| `mermaid-diagram.tsx` | mermaid | — |

Custom React Flow node types live in `src/components/diagrams/nodes/` (`module-node.tsx`, `commit-node.tsx`, `file-node.tsx`, `dependency-node.tsx`, `contributor-node.tsx`).

### Charts (`src/components/charts/`)
- `commit-heatmap.tsx` — recharts-based commit activity heatmap
- `language-donut.tsx` — recharts donut for language breakdown
- `commit-activity-chart.tsx` — recharts bar chart for commit history

### Key Library Files (`src/lib/`)
| File | Purpose |
|------|---------|
| `github.ts` | `ghFetch<T>()`, `fetchAllRepoData()`, `checkRepoAccess()` |
| `ai.ts` | AI service layer — Gemini key pool, `getMockAnalysis()`, `runAIPipeline()` |
| `graph-builder.ts` | Builds `GraphNode[]` / `GraphEdge[]` for `KnowledgeGraph` |
| `symbol-parser.ts` | Class/function/interface/type extraction + cross-file reference inference |
| `dep-parser.ts` | Parses `package.json`, `requirements.txt`, etc. into `ParsedDependency[]` |
| `mermaid-generator.ts` | Generates Mermaid diagram source from file tree |
| `impact-analyzer.ts` | Change-impact heuristics for file nodes |
| `search-engine.ts` | Client-side fuzzy search over repo nodes |
| `diagram-cache.ts` | `getCachedDiagram()` / `cacheDiagram()` — sessionStorage-backed cache |
| `dagre-layout.ts` | Shared dagre layout helper for React Flow diagrams |
| `force-layout.ts` | Custom force-directed layout engine for `KnowledgeGraph` |
| `motion.ts` | Shared framer-motion animation presets |
| `constants.ts` | `DIAGRAM_TABS`, `FILE_EXTENSION_COLORS`, `MODULE_TYPE_COLORS`, example repos |

### Type System
All shared types live in `src/types/index.ts` — treat it as the single source of truth. Never duplicate types.

### AI Analysis Modes
The `/api/analyze` endpoint supports two modes (passed as `mode` in the POST body):
- **`smart`** (default) — deterministic, no external API call, uses `getMockAnalysis()` from `src/lib/ai.ts`
- **`premium`** — calls an external AI API (Gemini by default); requires `GEMINI_API_KEY`, `GEMINI_API_KEYS` (comma-separated pool), or `AI_API_KEY` env vars, or a client-provided key via `aiSettings`

## Visual Design Rules (Non-Negotiable)

- **Background:** `#0a0e1a` (deep navy) — never white or light
- **Glassmorphism:** `backdrop-blur-xl`, `border-border/20`, `bg-white/5`
- **No flat/standard web design** — every surface uses glass + blur + neon accents
- **Neon palette:** indigo/violet (#6366f1), pink (#ec4899), cyan (#06b6d4), amber (#f59e0b)
- **Animation:** always `framer-motion` (`motion.ts` presets), never plain CSS transitions for enter/exit

## Conventions

### API Calls
- GitHub REST via `ghFetch<T>()` in `src/lib/github.ts` — includes ISR revalidation (5 min default)
- Raw file content: `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`
- Always pass `token` through — users supply GitHub PAT for higher rate limits

### Cytoscape Patterns
- Never put `layout:` key in the `cytoscape({...})` constructor — always run explicit `cy.layout({...}).run()` after init
- Hook `layoutstop` for post-layout callbacks (label culling, positioning)
- Re-run label adjustments on `zoom` and `pan` events
- Register plugins inside `if (typeof window !== 'undefined')` guard (SSR safe)
- Clean up instances: `cy.destroy()` in `useEffect` return

### Component State
- `repo-page-client.tsx` owns all repo data state; diagram components receive it as props
- Diagram components manage their own Cytoscape/ReactFlow/Canvas instance via `useRef` + `useEffect`
- No `useLayoutEffect` without SSR guard in Cytoscape/React Flow components

### Large Repo Handling
- `isLargeRepo` flag gates performance-heavy features: label culling, reduced animations, disabled auto-features
- Symbol graph: prefer high-confidence edges for large repos, reduce cross-file reference density

## File-Tree Graph Specifics

Key Cytoscape node data fields:
- `displayLabel` — disambiguated name (adds parent path for duplicate filenames)
- `compactLabel` — truncated with ellipsis (max 24 chars)
- `showLabel` — `1` for root-level or high-fanout (≥10 children) folders, `0` otherwise
- `symbolKind` — symbol node category (`class`, `function`, `interface`, `type`, `method`, `variable`)
- `parentPath` — for symbol nodes, points to owner file path (used for preview panel navigation)

Symbol graph behavior:
- `showSymbols` toggle (default ON) enables/disables symbol overlay without changing base file-tree graph
- Symbol nodes attached via `symbolContains` edges; cross-file refs use `symbolRef` edges with confidence levels (`high` from imports, `medium` from identifier inference)
- Clicking a symbol node opens its parent file in the right-side preview panel
- `focusNodeNeighborhood(cy, node)` — dims non-connected nodes to 0.12/0.06 opacity; `clearNodeFocus(cy)` resets
- Focused nodes tagged with `keepLabel=1` so labels persist after hover-out until focus is cleared

## Common Pitfalls

- **Double layout:** Don't put `layout:` in `cytoscape({})` constructor AND call `.layout().run()` — use explicit run only
- **`text-max-width` type:** Must be a string `'150px'`, not a number `150`
- **Flexbox squishing in sidebar:** Apply `shrink-0` to icons/fixed-width elements; `min-w-0 flex-1 truncate` to text elements
- **Import unused:** Remove unused imports before building — they mask real errors
- **`text-max-width` type:** Must be a string `'150px'`, not a number `150`
- **Knowledge graph Canvas:** `knowledge-graph.tsx` renders via `<canvas>` + `requestAnimationFrame` — do not attempt to swap in a graph library without understanding `src/lib/force-layout.ts`
- **diagram-cache:** Keyed by `${owner}/${repo}` + diagram type — clear on token change to avoid stale data
