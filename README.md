# Gitvize

**Visualize any GitHub repository's architecture, file structure, dependencies, and commit history — instantly.**

Gitvize turns any public GitHub repo URL into interactive, beautiful visualizations. Paste a `github.com/owner/repo` link and explore.

## Features

### File Tree Graph

- Live **force-directed physics simulation** (Graphology + Sigma.js + d3-force) — nodes spread organically, drag to reheat
- Symbol indexing: extracts **classes, functions, interfaces, types, methods, variables** from source files across TypeScript, JavaScript, Python, Go, Rust, Java, C/C++/C#
- **Code relationship edges**: Defines, Imports, Calls, Extends, Implements, File Imports — all toggleable independently
- Smart large-repo filtering: scores and ranks files by relevance when repos exceed 2,000 nodes; truncation banner shown
- **Hub nodes**: heavily-imported files render larger than peripheral files
- File type coloring, per-node size by file size, and hover labels
- Filter panel with per-kind symbol toggles and edge-type toggles — counts shown even when hidden
- File explorer with inline **Prism.js syntax highlighting**, symbol focus navigation, and drag-to-resize panels
- Full-text fuzzy search across all graph nodes

### Architecture Diagram

- Auto-generated Mermaid flowcharts showing how files relate to each other
- **Premium AI Diagramming**: uses `gemini-2.5-flash` to generate context-aware architectural diagrams
- Smart mode (deterministic, no external AI call) with optional Premium mode for richer AI output
- Files grouped into layers: App Routes, UI Components, Logic/Core, Config, Tests, Docs
- Interactive Mermaid rendering with pan/zoom, draggable nodes, and export to PNG / Mermaid code

### Dependencies

- Parses `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pyproject.toml`
- Solid lines = production dependencies, dotted lines = dev dependencies
- Left-to-right Dagre layout with legend

### Commits & Branches

- Scrollable timeline of all commits, grouped by date
- Author avatars, commit messages, relative timestamps, SHA badges
- Sort by newest/oldest/author; search by message, author, or SHA
- Paginated: loads 100 commits at a time with "Load more" / "Load all"
- Branch cards with color-coded branch pills

### Contributors Network

- Concentric ring layout showing contributor relationships
- Avatar nodes with commit count and activity metadata

### Repository Overview

- Language donut chart (Recharts), tech stack detection
- Contributor avatars, star/fork counts, repo metadata

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Languages | TypeScript + JavaScript + CSS |
| Styling | Tailwind CSS v4 |
| UI Components | Radix UI / shadcn/ui |
| Animations | Framer Motion |
| File Tree Graph | Graphology + Sigma.js + d3-force (RAF loop) |
| Architecture Diagrams | Mermaid.js |
| Charts | Recharts |
| Syntax Highlighting | Prism.js |
| Icons | Lucide React |
| Data Source | GitHub REST API (SSE streaming + 5-min cache) |
| Optional Infra | Upstash Redis cache/rate limit, Postgres + Drizzle |
| AI | Smart mode (deterministic) + Gemini/OpenAI/Anthropic premium mode |

## Getting Started

```bash
npm install
npm run dev       # dev server with Turbopack
npm run build     # production build
npm run lint      # ESLint
```

### Usage

1. Paste any GitHub repository URL — e.g. `https://github.com/facebook/react`
2. Gitvize fetches the file tree, branches, commits, contributors, and dependencies
3. Switch between tabs: **File Tree**, **Architecture**, **Contributors**, **Branches**, **Dependencies**
4. In the File Tree tab, use the filter panel to enable symbol types and code edges on demand
5. For AI features: enter your Gemini API key in Settings to unlock Premium Diagrams

### GitHub PAT (optional but recommended)

Add a GitHub Personal Access Token to avoid rate limits. Click the key icon in the header or set `gitviz_github_pat` in `localStorage`. With a token you get 5,000 API requests/hour instead of 60.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                     # Landing page
│   ├── [owner]/[repo]/              # Repo visualization page
│   └── api/
│       ├── github/repo/             # GitHub data fetching
│       │   ├── route.ts             # Main data endpoint
│       │   ├── access/route.ts      # Pre-flight accessibility check
│       │   ├── stream/route.ts      # SSE GitHub API streaming endpoint
│       │   ├── commits/route.ts     # Paginated commit history
│       │   ├── file/route.ts        # Fetch single file content
│       │   └── files/route.ts       # Batched file content fetch
│       ├── graph/seed/route.ts      # Precomputed layout seed positions
│       └── analyze/route.ts         # AI analysis endpoint
├── components/
│   ├── charts/                      # Recharts-based commit heatmap, language donut
│   ├── diagrams/                    # All graph/diagram components
│   │   └── nodes/                   # Custom React Flow node types
│   └── ui/                          # Reusable UI (shadcn/ui)
├── db/
│   ├── index.ts                     # Optional Drizzle/Postgres connection
│   └── schema.ts                    # Database schema
├── lib/
│   ├── github.ts                    # ghFetch, fetchAllRepoData, checkRepoAccess
│   ├── local-git.ts                 # Local git adapter utilities
│   ├── ai.ts                        # Gemini key pool, getMockAnalysis, analyzeRepository
│   ├── symbol-parser.ts             # Symbol extraction + multi-language import parsing
│   ├── dep-parser.ts                # Dependency manifest parser
│   ├── graph-builder.ts             # KnowledgeGraph node/edge builder
│   ├── force-layout.ts              # Custom force layout for KnowledgeGraph
│   ├── dagre-layout.ts              # Shared Dagre layout for React Flow
│   ├── mermaid-generator.ts         # Mermaid source generator
│   ├── search-engine.ts             # Client-side fuzzy search
│   ├── diagram-cache.ts             # sessionStorage-backed diagram cache
│   ├── ai-credits.ts                # Daily AI credit tracking
│   ├── constants.ts                 # Extension colors, diagram tab config
│   ├── file-icons.ts                # File extension → icon/color metadata
│   └── utils.ts                     # cn() class merger
└── types/index.ts                   # All shared TypeScript types
```

## Environment Variables

Core:

- `GITHUB_TOKEN` or `GITHUB_TOKENS` (comma-separated) for higher GitHub API limits
- `GEMINI_API_KEY` / `GEMINI_API_KEYS` or generic `AI_API_KEY` (+ optional `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`) for premium AI mode

Optional:

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for distributed cache/rate limiting
- `DATABASE_URL` for Postgres/Drizzle integration

## License

MIT

---

Built by [Aksh1810](https://github.com/Aksh1810)
