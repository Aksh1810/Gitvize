# GitViz — Agent Instructions

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

### Type System
All shared types live in `src/types/index.ts` — treat it as the single source of truth. Never duplicate types.

### Key Libraries
- **Cytoscape.js** — `file-tree-graph.tsx`, `contributors-network.tsx`; register plugins inside `if (typeof window !== 'undefined')` guard
- **React Flow** (`@xyflow/react`) — architecture + dependency graphs
- **framer-motion** — all animations (initial `opacity: 0, y: 10` → animate `opacity: 1, y: 0`)
- **lucide-react** — icons only (never other icon libraries)
- **recharts** — charts in dashboard overview
- **mermaid** — `mermaid-diagram.tsx` for generated diagrams
- **sonner** — toast notifications
- **Symbol parsing utility** — `src/lib/symbol-parser.ts` for class/function/interface/type/method/variable extraction and cross-file reference inference

## Visual Design Rules (Non-Negotiable)

- **Background:** `#0a0e1a` (deep navy) — never white or light
- **Glassmorphism:** `backdrop-blur-xl`, `border-border/20`, `bg-white/5`
- **No flat/standard web design** — every surface uses glass + blur + neon accents
- **Neon palette:** indigo/violet (#6366f1), pink (#ec4899), cyan (#06b6d4), amber (#f59e0b)
- **Animation:** always `framer-motion`, never plain CSS transitions for enter/exit

## Conventions

### API Calls
- GitHub REST via `ghFetch<T>()` in `src/lib/github.ts` — includes ISR revalidation (5 min)
- Raw file content: `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`
- Always pass `token` through — users supply GitHub PAT for higher rate limits

### Cytoscape Patterns
- Never put `layout:` key in the `cytoscape({...})` constructor — always run explicit `cy.layout({...}).run()` after init to avoid double-layout
- Hook `layoutstop` for post-layout callbacks (label culling, positioning)
- Re-run label adjustments on `zoom` and `pan` events

### Component State
- `repo-page-client.tsx` owns all repo data state; diagram components receive it as props
- Diagram components manage their own Cytoscape/ReactFlow instance via `useRef` + `useEffect`
- Clean up Cytoscape instances: `cy.destroy()` in `useEffect` return

### Large Repo Handling
- `isLargeRepo` flag (threshold: total nodes > some limit) gates performance-heavy features
- Label culling, reduced animations, and disabled auto-features activate for large repos

## File-Tree Graph Specifics

Key data fields per Cytoscape node:
- `displayLabel` — disambiguated name (adds parent path for duplicate filenames)
- `compactLabel` — truncated with ellipsis (max 24 chars)
- `showLabel` — `1` for root-level or high-fanout (≥10 children) folders, `0` otherwise
- `symbolKind` — symbol node category (`class`, `function`, `interface`, `type`, `method`, `variable`)
- `parentPath` — for symbol nodes, points to owner file path (used for preview panel navigation)

Symbol graph behavior:
- `showSymbols` toggle (default ON) enables/disables symbol overlay without changing base file-tree graph
- Symbol nodes are attached to file nodes via `symbolContains` edges
- Cross-file references use `symbolRef` edges with confidence levels (`high` from imports, `medium` from identifier inference)
- Large repos reduce symbol edge density by preferring high-confidence edges

Interactions:
- `focusNodeNeighborhood(cy, node)` — dims non-connected nodes to 0.12/0.06 opacity, highlights neighborhood
- `clearNodeFocus(cy)` — resets all to full opacity
- Focused neighborhood nodes are tagged with `keepLabel=1` so labels remain visible after hover-out until focus is cleared
- Clicking a symbol node opens its parent file in the existing right-side preview panel

## Common Pitfalls

- **Double layout execution:** Don't put `layout:` in `cytoscape({})` constructor AND call `.layout().run()` — pick one (use explicit run)
- **`text-max-width` type:** Must be a string `'150px'`, not a number `150`
- **Plugin registration:** `cytoscape.use(fcose)` must be inside `typeof window !== 'undefined'` guard (SSR safe)
- **No `useLayoutEffect` without SSR guard** in Cytoscape/React Flow components
- **Import unused:** Remove unused imports before building — they cause warnings that can mask real errors
- **Label persistence in large repos:** If focused labels disappear on hover-out, ensure `keepLabel` is set during focus and cleared only in `clearNodeFocus`
- **Symbol graph limits:** Keep file-size/file-count/reference caps in place to avoid rate-limit and render-performance regressions
- **Flexbox Squishing on Sidebar Resize:** Always apply `shrink-0` to icons and fixed-width elements inside flex containers, and `min-w-0 flex-1 truncate` to text elements alongside them, else they will squish uncontrollably when the parent sidebar shrinks.
