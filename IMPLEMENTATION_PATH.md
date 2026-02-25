# IMPLEMENTATION_PATH.md — GitViz

> The single source of truth for how GitViz was designed and how to continue building it.

---

## 1. Project Overview

**GitViz** is a premium GitHub repository visualization platform that transforms any public or private GitHub repository into an interactive, AI-enhanced visual experience. It is not just a diagram tool — it is a living, intelligent dashboard.

**Core concept:** The URL structure mirrors GitHub exactly. Visiting `gitviz.com/vercel/next.js` instantly visualizes `github.com/vercel/next.js`. Users can replace `hub` with `viz` in any GitHub URL — `github.com/owner/repo` becomes `gitviz.com/owner/repo`. The `/<owner>/<repo>` path is handled via Next.js App Router dynamic routing.

**What users see:**

1. A landing page with a single input that accepts a GitHub URL or `owner/repo` slug
2. A dashboard with 5 interactive visualizations, stats, charts, and an AI-generated architecture analysis
3. All diagrams are zoomable, pannable, and shareable

---

## 2. Architecture Decisions

### React Flow over D3

React Flow provides a declarative component model that integrates naturally with React. It offers built-in support for custom nodes, edges, minimap, controls, and zoom/pan — all things we need. D3 would require significantly more boilerplate for the same interactive graph experience, and integrating D3 imperatively within React components is error-prone.

### Dagre for Layout

Dagre is purpose-built for directed graph layout and produces clean hierarchical arrangements. It supports configurable direction (top-down, left-right), rank separation, and node separation — all exposed as options in our `getLayoutedElements` utility. Alternatives like ELK are more powerful but overkill for our use case.

### PostgreSQL over KV Store for Caching

Our analysis data is structured (modules, annotations, metadata) and benefits from relational queries (e.g., find all analyses for a given owner). PostgreSQL with Drizzle ORM gives us type-safe queries, schema migrations, and the ability to add indexes on composite keys (owner + repo + sha). A KV store would work for simple key-value caching but lacks the queryability we need for analytics and future features.

### 3-Step AI Pipeline

Separating the pipeline into Ingest → Understand → Enrich serves multiple purposes:

- **Ingest** is pure data fetching (no AI cost) and can be cached independently
- **Understand** produces the high-level architecture analysis (the most expensive step)
- **Enrich** adds per-file annotations without re-analyzing the full architecture
This separation allows us to re-run individual steps, cache at each level, and stream progress to the user.

### GitHub Token in localStorage

The PAT is stored client-side only for privacy. It is never sent to our server — it is passed directly to the GitHub API via the browser. This ensures we never store or log user credentials. The tradeoff is that server-side caching cannot use the token, but public repo data is cached regardless.

### Always-Dark Theme

GitViz uses a deep space aesthetic (#020817 background) as its only theme. This is a deliberate product decision — code visualization tools benefit from dark environments, and maintaining a single theme simplifies CSS significantly.

---

## 3. Data Flow

### Step-by-step: From URL to Visualization

```
User enters "vercel/next.js"
    │
    ├─ Frontend: Parse input → navigate to /vercel/next.js
    │
    ├─ [owner]/[repo]/page.tsx: Server component renders, generates metadata
    │
    ├─ repo-page-client.tsx (client): Mounts, reads PAT from localStorage
    │
    ├─ GET /api/github/repo?owner=vercel&repo=next.js
    │   ├─ fetchAllRepoData() — parallel Promise.all:
    │   │   ├─ fetchRepoMetadata()    → stars, forks, topics
    │   │   ├─ fetchContributors()    → top 30 contributors
    │   │   ├─ fetchLanguages()       → language breakdown
    │   │   ├─ fetchFileTree()        → recursive file tree
    │   │   ├─ fetchBranches()        → branch list
    │   │   ├─ fetchCommits()         → last 50 commits
    │   │   ├─ fetchReadme()          → decoded README
    │   │   └─ fetchDependencyFiles() → package.json, etc.
    │   └─ Return JSON to client
    │
    ├─ Client: Receives data → renders sidebar (stats, heatmap, donut)
    │
    ├─ POST /api/analyze (auto-triggered)
    │   ├─ If AI_API_KEY set:
    │   │   ├─ SSE stream: step=ingest → "Fetched N files"
    │   │   ├─ aiCompletion(ANALYSIS_PROMPT) → structured JSON
    │   │   ├─ SSE stream: step=understand → "Analyzing..."
    │   │   ├─ aiCompletion(ANNOTATION_PROMPT) → per-file annotations
    │   │   └─ SSE stream: step=enrich → final result
    │   └─ If no AI key:
    │       └─ getMockAnalysis() → inferred from directory structure
    │
    ├─ Client: Receives analysis → renders Architecture diagram
    │
    └─ User switches tabs → renders File Tree / Contributors / etc.
        └─ Each diagram transforms raw data into React Flow nodes/edges
            └─ Dagre layout positions nodes → React Flow renders
```

---

## 4. AI Pipeline Deep Dive

### Step 1 — Ingest

No AI involved. Fetches the file tree (via GitHub's recursive tree API) and the README content. This data becomes the input for the LLM.

### Step 2 — Understand (Analysis Prompt)

**System prompt:**
> "You are a senior software architect analyzing a GitHub repository. Your job is to understand the codebase structure and produce a detailed architectural analysis. You MUST respond with valid JSON."

**User prompt includes:** The first 500 file paths and first 3000 chars of README.

**Expected JSON schema:**

```json
{
  "techStack": ["string[]"],
  "architecturePattern": "string",
  "description": "string",
  "modules": [{
    "name": "string",
    "type": "api|ui|database|config|utility|test|build|docs|core|middleware|service|model|controller|view|other",
    "description": "string",
    "files": ["string[]"],
    "dependencies": ["string[]"],
    "entryPoint": "string?"
  }],
  "entryPoints": ["string[]"],
  "dataFlow": [{ "from": "string", "to": "string", "description": "string" }]
}
```

### Step 3 — Enrich (Annotation Prompt)

**User prompt includes:** First 200 file paths + module names from Step 2.

**Expected JSON schema:**

```json
{
  "annotations": [{
    "path": "string",
    "role": "string",
    "description": "string",
    "module": "string"
  }]
}
```

### Mapping to React Flow

Each `module` becomes a `ModuleNode` in the architecture diagram. Each `dataFlow` entry becomes an animated edge. Colors are assigned by `module.type` using `MODULE_TYPE_COLORS`. Dagre positions nodes in a top-down hierarchy based on dependency edges.

### Changing the Model/Provider

Set these environment variables:

- `AI_PROVIDER` — `openai`, `anthropic`, or `openai-compatible`
- `AI_MODEL` — e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`
- `AI_API_KEY` — your API key
- `AI_BASE_URL` — custom base URL for compatible APIs (optional)

---

## 5. Database Schema

### Tables

**`repositories`** — Cached repo metadata

| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| owner | text | GitHub owner |
| repo | text | GitHub repo name |
| full_name | text | owner/repo |
| description | text? | Repo description |
| stars, forks, watchers, open_issues | integer | Stats |
| license, language | text? | Metadata |
| topics | jsonb | String array |
| default_branch | text | e.g., "main" |
| latest_sha | text | Latest commit SHA (cache key) |
| pushed_at | text | Last push timestamp |
| html_url | text | GitHub URL |
| created\_at, updated\_at | timestamp | Audit timestamps |

**Unique index:** `(owner, repo)`

**`analyses`** — AI analysis results

| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| owner, repo | text | Repo identifier |
| commit_sha | text | SHA at time of analysis |
| architecture | jsonb | ArchitectureAnalysis JSON |
| annotations | jsonb | FileAnnotation[] JSON |
| file_tree, contributors, branches, commits, languages, dependencies | jsonb | Cached raw data |
| generated_at | timestamp | When analysis was created |

**Unique index:** `(owner, repo, commit_sha)` — the cache key

**`pipeline_logs`** — Pipeline execution logs

| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| owner, repo | text | Repo identifier |
| step | text | ingest, understand, enrich |
| status | text | pending, running, complete, error |
| message | text? | Status message |
| error_details | text? | Error stack trace |
| duration_ms | integer? | Step duration |
| created_at | timestamp | Log timestamp |

### Caching Strategy

Cache key: `owner + repo + commit_sha`. On each visit:

1. Fetch latest SHA via `fetchLatestSha()`
2. Query `analyses` table for matching `(owner, repo, sha)`
3. If found → serve cached result (instant load)
4. If not found → run pipeline, store result

The `Regenerate` button bypasses the cache check and forces a fresh analysis.

---

## 6. Visualization Architecture

### Shared Infrastructure

All 5 diagrams use `FlowWrapper` — a shared React Flow container providing:

- `<Background variant="dots" />` with indigo-tinted dots
- `<MiniMap />` with dark theme
- `<Controls />` with glassmorphism styling
- Fit-to-view, zoom (0.1x–3x), pan
- `onNodeClick` callback delegation

All diagrams use `getLayoutedElements()` from `lib/dagre-layout.ts` for automatic positioning.

### 1. Architecture Diagram (AI-Generated)

- **Data source:** `ArchitectureAnalysis` from AI pipeline
- **Node type:** `ModuleNode` — shows name, type icon, description, file count
- **Edges:** From `module.dependencies` (solid) and `dataFlow` (dashed cyan)
- **Interaction:** Click opens `<Sheet>` side panel with file list and GitHub links
- **Layout:** Dagre TB, 250×100 nodes, 100px rank separation

### 2. File Tree Graph

- **Data source:** GitHub tree API response (`TreeItem[]`)
- **Node types:** `FileNode` — dual-purpose for files and folders
- **Key feature:** Lazy expansion — starts collapsed at root, expands on click
- **Color coding:** File extension → color via `FILE_EXTENSION_COLORS`
- **Layout toggle:** Button switches between TB and LR Dagre directions
- **Interaction:** Click folder = expand/collapse. Click file = opens drawer.
- **Performance:** Limited to 300 visible nodes at a time

### 3. Contributors Network

- **Data source:** Contributors API (top 30)
- **Node type:** `ContributorNode` — avatar, username, commit badge
- **Edges:** Connect contributors with similar contribution levels (approximation of co-modification)
- **Edge thickness:** Proportional to shared activity ratio
- **Interaction:** Click opens GitHub profile in new tab
- **Layout:** Dagre TB, 120×100 nodes

### 4. Branch & Commit Graph

- **Data source:** Branches API + Commits API
- **Node type:** `CommitNode` — small circle with SHA tooltip
- **Layout:** Horizontal spine for default branch, feature branches diverge above/below
- **Color coding:** Each branch gets a unique color from a palette
- **Hover:** Tooltip shows SHA, message, author, date
- **Non-default branches:** Attached as labeled nodes with dashed edges

### 5. Dependency Graph

- **Data source:** Parsed manifest files (package.json, requirements.txt, etc.)
- **Parser:** `lib/dep-parser.ts` — supports 5 formats
- **Node type:** `DependencyNode` — sized by dependent count
- **Root node:** Project name
- **Edges:** Solid for direct deps, dashed for dev deps
- **Layout:** Dagre TB, limited to top 40 deps

### Side Panel / Drawer System

- Architecture diagram uses `<Sheet>` (shadcn) as a slide-in right panel
- File tree uses `<Sheet>` as a file detail drawer
- Both show relevant data + GitHub link

---

## 7. Environment Variables

```bash
# --- GitHub ---
GITHUB_TOKEN=         # Optional. GitHub PAT for higher API rate limits (server-side).

# --- AI Configuration ---
AI_PROVIDER=openai    # Required for AI features. "openai" | "anthropic" | "openai-compatible"
AI_API_KEY=           # Required for AI features. Your API key.
AI_MODEL=gpt-4o       # Optional. Defaults to gpt-4o.
AI_BASE_URL=          # Optional. Custom base URL for compatible APIs.

# --- Database ---
DATABASE_URL=         # Optional. PostgreSQL connection string. Without this, caching is disabled.
                      # Example: postgresql://user:pass@localhost:5432/gitviz

# --- Analytics ---
NEXT_PUBLIC_POSTHOG_KEY=    # Optional. PostHog project API key.
NEXT_PUBLIC_POSTHOG_HOST=   # Optional. PostHog host URL.

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Required. The app's public URL.
```

**The app runs without any environment variables** — it uses mock AI analysis and skips database caching. Only `AI_API_KEY` and `DATABASE_URL` are needed for full functionality.

---

## 8. Phased Roadmap

### Phase 1 — Foundation ✅

- [x] Next.js 14+ project with App Router, TypeScript, Tailwind CSS
- [x] shadcn/ui component library (13 components)
- [x] Deep-space theme with glassmorphism CSS
- [x] Dynamic `[owner]/[repo]` routing with metadata generation
- [x] GitHub API service layer (8 endpoints, parallel fetching)
- [x] Drizzle ORM schema (3 tables)
- [x] UI shell: navbar, tab navigation, layout
- [x] `.env.example`

### Phase 2 — Core Visualizations ✅

- [x] React Flow base wrapper with dots, minimap, controls
- [x] Architecture diagram (AI-generated module graph)
- [x] File tree graph (expand/collapse, color-coded, layout toggle)
- [x] Contributors network (avatars, co-modification edges)
- [x] Branch & commit graph (horizontal spine, feature branches)
- [x] Dependency graph (parsed manifests, sized nodes)
- [x] Commit heatmap (52-week grid)
- [x] Language donut chart (Recharts)
- [x] Repo overview card (stats, topics, README, tech stack)

### Phase 3 — AI Pipeline ✅

- [x] Configurable AI client (OpenAI, Anthropic, compatible)
- [x] 3-step pipeline: Ingest → Understand → Enrich
- [x] Streaming SSE progress to frontend
- [x] Mock analysis fallback (no API key needed for development)
- [x] Pipeline status display component
- [x] Regenerate button

### Phase 4 — Product Polish (Partial)

- [x] Landing page (hero input, example cards, how-it-works)
- [x] Share button (clipboard + toast)
- [x] Tab-specific URLs via query params
- [x] Framer Motion animations (staggered entrance, tab transitions)
- [x] Responsive layout
- [x] Dynamic OG meta tags
- [ ] Export PNG button (needs `html-to-image` integration)
- [ ] Embed `<iframe>` snippet generator
- [ ] Private repo PAT modal (localStorage UI)
- [ ] Skeleton loaders (basic — needs refinement)

### Phase 5 — Launch Readiness (Remaining)

- [ ] PostHog analytics integration
- [ ] CI/CD: GitHub Actions workflow
- [ ] `vercel.json` configuration
- [ ] Performance: virtual rendering for 1000+ files
- [ ] Database caching integration (queries/writes)

---

## 9. Known Limitations & Future Work

### Current Limitations

- **GitHub API rate limiting:** Unauthenticated requests are limited to 60/hour. Large repos may hit limits. Providing a PAT raises this to 5000/hour.
- **Very large repos (10k+ files):** The file tree API may return truncated results. We handle this but visualization may be incomplete.
- **Monorepos:** The architecture analysis treats the repo as a single project. Multi-package monorepos need special handling.
- **Contributors co-modification:** Currently approximated by contribution similarity rather than actual file co-modification data (which would require per-commit file diffing).
- **No persistent database:** The app works without PostgreSQL but re-runs analysis on every visit. Database caching is scaffolded but not yet connected.

### Future Features

- **Real-time collaboration:** WebSocket-based shared cursors on diagrams
- **PR diff visualization:** Show what changed in a PR as highlighted nodes
- **Time-travel:** Visualize the repo at any point in its git history
- **Package vulnerability highlighting:** Flag known CVEs in the dependency graph
- **Custom themes:** Let users choose color schemes
- **API rate:** Build a proxy to manage GitHub API tokens centrally
- **Embeddable widgets:** Small diagram components for READMEs and docs

---

## 10. Contributing Guide

### Prerequisites

- Node.js 20+ (tested with v25.2.1)
- npm 10+
- PostgreSQL 15+ (optional, for caching)

### Local Setup

```bash
# Clone the repo
git clone https://github.com/your-org/gitviz.git
cd gitviz

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# (Optional) Set your AI API key in .env.local
# AI_API_KEY=sk-...

# (Optional) Set your database URL in .env.local
# DATABASE_URL=postgresql://...

# Start the dev server
node node_modules/next/dist/bin/next dev

# Or if next CLI works:
npm run dev

# Open http://localhost:3000
```

### Build & Verify

```bash
# Type-check + build
node node_modules/next/dist/bin/next build

# Lint
npm run lint
```

### Database Setup (Optional)

```bash
# Create database
createdb gitviz

# Generate migrations
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

### Project Structure

```
src/
├── app/           — Next.js pages and API routes
├── components/    — React components (ui/, dashboard/, diagrams/, charts/, panels/)
├── lib/           — Business logic (github.ts, ai.ts, dagre-layout.ts, etc.)
├── db/            — Database schema and connection
├── types/         — TypeScript type definitions
└── styles/        — Global CSS
```

### Submitting a PR

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run `npm run lint` and `npm run build` to verify
5. Submit a PR with a clear description of what changed and why
