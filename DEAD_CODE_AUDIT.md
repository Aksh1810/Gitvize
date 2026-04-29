# Dead Code Audit — GitViz

Generated before any deletions. All findings verified by grep across the entire `src/` directory.

---

## Orphaned Files

Files that are never imported anywhere and are not Next.js entry points.

| File | Reason |
|------|--------|
| `src/workers/graph-simulation.worker.ts` | D3-force simulation worker. Replaced by cosmos.gl. No `new URL(...)` reference exists anywhere. |
| `src/lib/force-layout.ts` | graphology + ForceAtlas2 layout for React Flow. Replaced by cosmos.gl. Never imported. |
| `src/lib/dagre-layout.ts` | dagre hierarchical layout for React Flow. Never imported anywhere. |
| `src/hooks/use-force-simulation.ts` | D3-force hook built for React Flow. Never imported anywhere. |
| `src/components/diagrams/flow-wrapper.tsx` | ReactFlow `<ReactFlow>` wrapper component. Never imported anywhere. |
| `src/components/diagrams/nodes/obsidian-file-node.tsx` | ReactFlow Obsidian-style file node. Never imported anywhere. |
| `src/components/diagrams/nodes/contributor-node.tsx` | ReactFlow contributor node. Never imported anywhere. |
| `src/components/diagrams/nodes/commit-node.tsx` | ReactFlow commit node. Never imported anywhere. |
| `src/components/diagrams/nodes/module-node.tsx` | ReactFlow module node. Never imported anywhere. |
| `src/components/diagrams/nodes/dependency-node.tsx` | ReactFlow dependency node. Never imported anywhere. |
| `src/components/diagrams/nodes/file-node.tsx` | ReactFlow file node. Never imported anywhere. |

---

## Unused Exports

Exported functions never called outside their own file.

| File | Function | Evidence |
|------|----------|----------|
| `src/lib/github.ts` | `fetchLatestSha` | Exported, zero references in src/ |
| `src/lib/github.ts` | `fetchCommitAuthorMap` | Exported, zero references in src/ |
| `src/lib/file-icons.ts` | `getFileIconName` | Exported, zero references in src/ |
| `src/lib/diagram-cache.ts` | `hasCachedDiagram` | Exported, zero references in src/ |

---

## Debug Console Logs

| File | Line | Statement |
|------|------|-----------|
| `src/app/[owner]/[repo]/repo-page-client.tsx` | 251 | `console.log('[analyze] sampled ... files for analysis')` |

---

## Dead Package Dependencies

Packages in `package.json` with zero imports in `src/`.

| Package | Last Known Use |
|---------|----------------|
| `sigma` | Never imported in src/ |
| `pixi.js` | Never imported in src/ |
| `graphology` | Only in orphaned `src/lib/force-layout.ts` |
| `graphology-layout-forceatlas2` | Only in orphaned `src/lib/force-layout.ts` |
| `graphology-communities-louvain` | Never imported in src/ |
| `graphology-types` | Never imported in src/ |
| `cytoscape` | String reference only (KNOWN_PACKAGES registry in dependency-graph.tsx) |
| `cytoscape-fcose` | String reference only (KNOWN_PACKAGES registry in dependency-graph.tsx) |
| `@types/cytoscape` | Types for unused cytoscape package |
| `dagre` | Only in orphaned `src/lib/dagre-layout.ts` |
| `@types/dagre` | Dev types for orphaned dagre-layout.ts |
| `@xyflow/react` | Only in the 11 orphaned files above |
| `d3-force` | Only in orphaned graph-simulation.worker.ts and use-force-simulation.ts |
| `@types/d3-force` | Dev types for orphaned d3-force code |

---

## False Positives / Do Not Touch

- `src/db/` — all files protected (DB layer not yet wired, intentional)
- `src/workers/symbol-analysis.worker.ts` — dynamically loaded at file-tree-graph.tsx:943,1036
- `src/workers/knowledge-graph-sim.worker.ts` — dynamically loaded at knowledge-graph.tsx:78
- All console statements in stream/route.ts, ai.ts, analyze/route.ts, branch-graph.tsx, mermaid-diagram.tsx — operational/error handling

---

## Final Summary

- Files removed: 11 (10 orphaned node/component files + 1 orphaned worker)
- Functions removed: 4 (`fetchLatestSha`, `fetchCommitAuthorMap`, `getFileIconName`, `hasCachedDiagram`) + 1 unused import (`MessageCircle`)
- Lines removed: ~1,100 lines of source code (1,426 total including package-lock.json delta)
- Packages uninstalled: 14 (`sigma`, `pixi.js`, `graphology`, `graphology-layout-forceatlas2`, `graphology-communities-louvain`, `graphology-types`, `cytoscape`, `cytoscape-fcose`, `@types/cytoscape`, `dagre`, `@types/dagre`, `@xyflow/react`, `d3-force`, `@types/d3-force`)
- False positives found during deletion: 0 — all 11 file deletions and all package removals passed build with zero errors
- Pre-existing lint issues (not in scope): `no-explicit-any` in github.ts, `no-img-element` warnings, react-hooks warnings in knowledge-graph/commit-history-rail, unused `request` param in proxy.ts, unused `projectName` prop in dependency-graph.tsx
