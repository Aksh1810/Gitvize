# 🔮 Gitvize

**Visualize any GitHub repository's architecture, file structure, dependencies, and commit history — instantly.**

Gitvize turns any public GitHub repo URL into interactive, beautiful visualizations. Paste a `github.com/owner/repo` link and explore.

## ✨ Features

### 📐 Architecture Diagram

- Auto-generated **Mermaid flowcharts** showing how files relate to each other
- Files grouped into layers: App Routes, UI Components, Logic/Core, Config, Tests, Docs
- Draggable nodes, pan/zoom, export to PNG, and copy Mermaid code
- Interactive Mermaid rendering with pan/zoom + export

### 🌳 File Tree

- Interactive **Cytoscape.js** force-directed graph of the repository's file structure
- Nodes colored by file type with distinct, bright colors per extension
- Click any file to preview its code with **Prism.js syntax highlighting** in the explorer-linked inspector pane
- Search files by name with real-time filtering
- File type breakdown available in the main sidebar below Languages

### 📦 Dependencies

- Parses dependency manifests to visualize project dependencies as a graph
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
- **Vercel Analytics** support for production traffic insights
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

### Usage

1. Paste any GitHub repository URL (e.g. `https://github.com/facebook/react`)
2. Gitvize fetches the repo's file tree, branches, commits, and dependencies
3. Switch between tabs: **Architecture**, **File Tree**, **Branches**, **Dependencies**, **Contributors**

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

## 📄 License

MIT

---

Built by [Aksh1810](https://github.com/Aksh1810)
