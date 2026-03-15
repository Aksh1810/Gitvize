# 🔮 GitViz

**Visualize any GitHub repository's architecture, file structure, dependencies, and commit history — instantly.**

GitViz turns any public GitHub repo URL into interactive, beautiful visualizations. Just paste a `github.com/owner/repo` link and explore.

## ✨ Features

### 📐 Architecture Diagram

- Auto-generated **Mermaid flowcharts** showing how files relate to each other
- Files grouped into layers: App Routes, UI Components, Logic/Core, Config, Tests, Docs
- Draggable nodes, pan/zoom, export to PNG, and copy Mermaid code
- Click any node to jump to the file on GitHub

### 🌳 File Tree

- Interactive **Cytoscape.js** force-directed graph of the repository's file structure
- Nodes colored by file type with distinct, bright colors per extension
- Click any file to preview its code with **Prism.js syntax highlighting** in the explorer-linked inspector pane
- Search files by name with real-time filtering
- File type breakdown available in the main sidebar below Languages

### 📦 Dependencies

- Parses `package.json` to visualize **npm dependencies** as a graph
- Solid lines = production dependencies, dotted lines = dev dependencies
- Left-to-right layout with a clear legend

### 🕐 Commits & Branches

- Scrollable **timeline view** of all commits, grouped by date
- Author avatars, commit messages, relative timestamps, and SHA badges
- Click any commit to expand and see full date + branch info
- **Sort by**: Newest first, Oldest first, or Author A–Z
- **Search** commits by message, author, or SHA
- **Paginated loading**: loads 100 commits at a time with "Load more" and **"Load all"** buttons
- Rate limit notification if GitHub API limit is reached
- Branch cards showing all branches with color-coded pills

### 📊 Repository Overview (Sidebar)

- Repo name as a clickable GitHub hyperlink
- **Language donut chart** with separated segments (Recharts)
- **Tech stack** showing only frameworks & tools (not raw languages)
- Contributor avatars and star/fork counts

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| UI Components | Radix UI / shadcn/ui |
| Animations | Framer Motion |
| Architecture Diagrams | Mermaid.js |
| File Tree Graph | Cytoscape.js + fcose layout |
| Dependency Graph | React Flow (@xyflow/react) + Dagre |
| Charts | Recharts |
| Syntax Highlighting | Prism.js |
| Icons | Lucide React |
| Data Source | GitHub REST API |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm / yarn / pnpm

### Installation

```bash
git clone https://github.com/Aksh1810/Gitviz.git
cd Gitviz
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. Paste any GitHub repository URL (e.g. `https://github.com/facebook/react`)
2. GitViz fetches the repo's file tree, branches, commits, and dependencies
3. Switch between tabs: **Architecture**, **File Tree**, **Branches**, **Dependencies**, **Contributors**

### Environment Variables (Optional)

```env
GITHUB_TOKEN=ghp_your_token_here
```

Adding a GitHub Personal Access Token increases your API rate limit from 60 to 5,000 requests/hour — useful for large repos with thousands of commits.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page with URL input
│   └── [owner]/[repo]/     # Dynamic repo visualization page
├── components/
│   ├── charts/             # Language donut chart
│   ├── dashboard/          # Repo overview sidebar, tab nav, header
│   ├── diagrams/           # Architecture, file tree, branch, dependency graphs
│   └── ui/                 # Reusable UI components (shadcn/ui)
├── lib/
│   ├── github.ts           # GitHub API client (fetch tree, commits, branches)
│   ├── ai.ts               # Architecture analysis & tech stack inference
│   ├── mermaid-generator.ts # Auto-generates Mermaid code from file tree
│   ├── constants.ts        # File extension colors, module type colors
│   └── file-icons.ts       # File color & icon mapping
└── types/                  # TypeScript type definitions
```

## Production Readiness Notes (March 2026)

- Baseline architecture preserved: App Router structure, API routes, diagram components, and shared types remain unchanged.
- Simplification pass completed:
	- Removed unused imports and dead helper constants in diagrams/lib modules.
	- Replaced unsafe hook patterns that triggered cascading render lint errors.
	- Reduced mutable-state anti-patterns in the canvas knowledge graph drag logic.
	- Tightened Cytoscape typing in the file-tree graph to satisfy strict TypeScript checks.
- Validation status:
	- `npm run build` passes.
	- `npm run lint` has no errors; remaining warnings are image optimization recommendations for avatar/graph image rendering.
- Remaining optional hardening work:
	- Replace selected `<img>` usages with `next/image` in graph/timeline node renderers where layout constraints allow.
	- Add lightweight end-to-end smoke tests for public/private repo entry flow.

## 📄 License

MIT

---

Built by [Aksh1810](https://github.com/Aksh1810)
