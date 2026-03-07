# GitViz: Comprehensive LLM Context Handover

This document serves as the absolute source of truth for any LLM agent taking over the GitViz project. It details the entire history, architecture, user interface design language, mathematical algorithms used for layouts, and specific functional implementations from the project's inception up to its current state on the `feature/branch-merge-graph` branch.

Please read this entire document carefully before making any structural changes to the project.

---

## 1. Project Inception & Purpose

GitViz was conceived to solve a specific problem: standard GitHub interfaces present repository data (files, commits, contributors, languages) in a fragmented, list-heavy format that lacks visual context. GitViz transforms this raw data into an aesthetic, interactive, node-graph-driven dashboard.

The application allows users to enter any public GitHub repository (e.g., `vercel/next.js`, `facebook/react`) and instantly view:

- A node-based architecture graph of its files.
- A visual dependency map.
- A proportional donut chart of languages.
- An interactive, concentric contributor network.
- A visual topology of its branches and merge history.

---

## 2. Tech Stack & Key Libraries

GitViz is built on a modern, React-based stack designed for performance and high-end visual fidelity.

### Core Framework

- **Next.js 15 (App Router):** The application relies entirely on client-side fetching (`"use client"`) for the dashboard views, while maintaining server-rendering capabilities for static parts. Turbopack is the default bundler.
- **Language:** TypeScript strictly adopted across all components. (`src/types/index.ts` is the central source of truth for all API response types).

### UI & Styling

- **Tailwind CSS:** Used for all styling. The project leans heavily into a highly customized dark mode. Standard background is `#0a0e1a` (deep navy).
- **Glassmorphism:** Achieved via `backdrop-blur-xl`, semi-transparent borders (`border-border/20`), and subtle `bg-white/5` or `bg-indigo-500/10` background colors.
- **Animations:** `framer-motion` is used to animate component mounting (e.g., `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}`). List items feature staggered delay mounting.
- **Icons:** `lucide-react`.

### Graph Visualization Libraries

- **React Flow (`@xyflow/react`):** The engine driving the interactive node graphs (Architecture, Dependencies, Contributors). Custom nodes are built as React components and passed to the `nodeTypes` prop.
- **Dagre Layout:** Initially used for all flow layout calculations (top-to-bottom branching). Now partially phased out in favor of custom mathematical layouts (e.g., the concentric rings) to overcome layout rigidity.

---

## 3. Data Layer Architecture (GitHub API Service)

All data fetching is centralized in `src/lib/github.ts`. The application talks strictly to the REST API (`https://api.github.com`).

### Core Philosophy

To minimize load times, data is fetched completely in parallel using `Promise.all` inside the `fetchAllRepoData` function.

### Implemented Endpoints

1. **Repository Metadata (`/repos/{owner}/{repo}`):** Fetches description, stars, forks, watchers.
2. **Languages (`/repos/{owner}/{repo}/languages`):** Returns key-value pairs of language bytes.
3. **Contributors (`/repos/{owner}/{repo}/contributors?per_page=100`):** Gets top 100 contributors via `contributions` count.
4. **Tree (`/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`):** Recursively fetches the entire repository file structure to render the file tree and architecture map.
5. **Package.json Metadata:** Specifically fetches the raw `package.json` file from the repo's default branch to parse dependencies for the Dependency Graph.
6. **Commits (`/repos/{owner}/{repo}/commits?per_page=50`):** Used for the linear commit timeline. Features pagination looping (`page=2, 3...`) when the user clicks "Load More".
7. **Merged Pull Requests (`/repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`):** Used explicitly for the Branch Merge Graph to map topology accurately. It filters the returned list natively to ensure `merged_at` is non-null.

### Rate Limit & Error Handling System

GitHub allows 60 unauthenticated requests per hour. GitViz implements a global `rateLimitHit` boolean state in `repo-page-client.tsx`.

When `fetch` returns a `403` or `429` status code, the error is caught, and `rateLimitHit` drops to `true`. This instantly replaces the header with a yellow `<AlertTriangle>` banner instructing the user to wait or input a GitHub PAT (Personal Access Token). Fallback components trigger cleanly instead of crashing the React tree.

---

## 4. UI Architecture & State Management

The main dashboard is controlled by `src/app/[owner]/[repo]/repo-page-client.tsx`.

1. **Loading State:** A fullscreen loading spinner with the app logo pulses while the `Promise.all` executes.
2. **The Sidebar Navigation:** A tabbed navigation row allows the user to switch between "File Tree", "Architecture", "Contributors", "Branches", and "Dependencies".
3. **State Drilling:** `RepoData` is stored in a React state and passed down as props to the active tab component.
4. **Right Panel:** A sticky side panel displays the Repo overview (Stars, Forks) and the Language Donut chart persistently, independent of the active tab.

---

## 5. Detailed Component Breakdown

### A. The Language Donut (`src/components/diagrams/language-donut.tsx`)

**Initial Problem:** Repositories have extreme variance in language distribution. A repo that is 99% TypeScript and 0.1% Shell scripting resulted in the Shell slice being microscopically thin, completely invisible, and unclickable on standard SVG charts.

**The Mathematical Solution:**

- Calculated the raw percentages of bytes for each language.
- Implemented an algorithm to guarantee a **Minimum Visual Threshold (3%)** for any language.
- Required complex normalization: If a 0.1% language is boosted to 3% visualization space, the other language slices must be proportionally shrunk to ensure the SVG circle perfectly equals 360 degrees (100%).
- Used `cos` and `sin` to draw precise SVG `<path>` arcs.
- The resulting UI shows perfectly clickable slices for tiny languages while the legend/tooltip honestly reports the original "0.1%".

### B. The Contributor Network (`src/components/diagrams/contributors-network.tsx`)

**Evolution:**
The Contributor view initially used a standard `dagre` top-to-bottom layout drawing arbitrary spaghetti edges between contributors based on roughly equal commit numbers. This resulted in an unreadable, vertically-scrolling single-file line of identical nodes.

**The Redesign (Concentric Ring Layout):**
To represent contributor hierarchy visually, the dagre layout was discarded in favor of a packed **Concentric Ring Algorithm**.

- **Calculations & Positioning:**
  - The node with the highest commit count (#1) is placed statically at `(x: 400, y: 300)` (Center).
  - subsequent nodes are divided into rings:
    - **Ring 1:** Nodes 2 through 7 (Radius: 180px).
    - **Ring 2:** Nodes 8 through 19 (Radius: 330px).
    - **Ring 3:** Nodes 20 through 30 (Radius: 470px).
  - For each node in a ring, its `angle` on the circle is calculated using `(2 * Math.PI * index) / total_nodes_in_ring - Math.PI / 2`.
  - Cartesian coordinates are calculated via `centerX + cos(angle) * r` and `centerY + sin(angle) * r`.
- **Node Size Scaling (`contributor-node.tsx`):**
  - Node avatar sizes scale mathematically relative to the #1 contributor. Smallest node is `40px`; max is `90px`.
- **Aesthetic Tiers:**
  - Nodes are explicitly color-coded by rank: Gold (`#f59e0b`) for #1, Cyan (`#22d3ee`) for 2-3, Indigo (`#6366f1`) for 4-6, Purple (`#a855f7`) for 7-10, and Slate for 11+.
  - Nodes 1, 2, and 3 physically render 🥇, 🥈, and 🥉 emojis over their avatars.
  - A blurred `<div/>` sits behind the avatar, matching its tier color, creating a neon glow effect.
- **Edges:** Artificial "spaghetti" relationships were deleted. Extremely subtle `0.08` opacity edges now only connect the center node to Ring 1 as an aesthetic anchor.
- **List View:** The component has a toggle switch allowing users to view the raw data as a leaderboard list, utilizing horizontal progress bars to represent the commit ratio vs the top contributor.

### C. Branch Merge Timeline (`src/components/diagrams/branch-graph.tsx` & `merge-graph.tsx`)

**The Topology Problem:**
A raw `git log` or the GitHub Commit API presents a flat list. It's impossible to easily derive "when did feature branch X fork from and merge into main?" without complex hash traversal.

**The Solution:**
Switching from Commits to Merged Pull Requests.

- Added an explicit `Network` vs `List` tab toggle in `branch-graph.tsx`.
  - "List" renders the old, linear commit history.
  - "Graph" explicitly loads the new `<MergeGraph/>` component.

#### Merge Graph Architecture

The Merge Graph was completely custom-built as an HTML/CSS vertical timeline rather than using `<ReactFlow>`. The visual fidelity requirement was too high for a standard node canvas.

1. **The Spine:** A deep purple/indigo vertical border line down the exact `23px` relative left mark. This represents `main` / the default branch.
2. **Date Grouping:** The array of `MergedPR` objects is passed through a `useMemo` that groups them dynamically by month (e.g., "MARCH 2026"). A clear visual separator (a dark circle with a line) breaks the timeline to establish temporal context.
3. **Deterministic Coloring:** The component extracts a unique set of `headBranch` names from the PRs, and deterministically assigns them a color from a 12-color array. This ensures all PRs originating from `feature/auth` match the same color visually.
4. **The Merge Card (`<motion.div>`):**
    - To represent a branch merging into the spine, a small horizontal colored line shoots out from the spine to the right, attaching to the card.
    - **Header:** A colored pill badge displaying the source branch, an arrow icon, and the target base branch (`feature/x → main`).
    - **Metadata:** PR Title, `#` number badge, author avatar (falling back to a generic Lucide `<User>` if null), author login, and a "merged by" indicator if different from the author.
    - **Expandable Details:** Clicking anywhere on the card fires an `AnimatePresence` height transition that drops out the exact timestamp and a hyperlink to view the PR directly on GitHub.
5. **Scaling & Pagination Strategies:**
    - GitHub repositories can contain tens of thousands of PRs. Loading them all would immediately crash the JS thread and exhaust the API rate limit.
    - `fetchMergedPRs` only initially asks for `per_page=50`.
    - At the bottom of the timeline, a dense `backdrop-blur-xl` control bar floats. Clicking "Load more PRs" fires an async request for `page + 1`, appending the new PRs to the existing array. A `<Loader2 className="animate-spin" />` gives immediate feedback.

---

## 6. Known Edge Cases, Caveats, & Troubleshooting

### A. The Next.js Disk Space Issue

You may frequently run into `ENOSPC: no space left on device` or `StorageFull` errors when triggering `npx next build` or `npm run dev`.
**Cause:** Next.js 15 Turbopack generates a massive cache in the `.next` directory that quickly fills up tiny virtual filesystems.
**Solution:** Before running dev, *always* execute:
`rm -rf .next && npm run dev`
Additionally, if it persists, use `npm cache clean --force` and wipe `/tmp/`.

### B. Fallback Handling

Not all repositories use Pull Requests exclusively; some use direct commits to main. If `mergedPRs.length === 0`, the `<MergeGraph>` component intentionally bails early and returns a centered, aesthetic empty state informing the user that no PR merge history is available.

### C. Rate Limit Prop Drilling

If you add new endpoints to `lib/github.ts`, be absolutely certain they have a `try/catch` block that accurately sets `rateLimitHit` if a `403` or `429` error is thrown by GitHub. The entire app relies on this flag to gracefully degrade.

---

## 7. Next Tasks For the Incoming Agent

You are taking over a highly-polished, premium visual dashboard. Your immediate next steps, should the user prompt for them, should involve:

1. **Architecture Graph Parsing Improvements:** Currently, the architecture file tree parser loads maximum depth. Very large monorepos can stutter here. Consider optimizing `getArchitectureNodes` or implementing tree-shaking virtualized node sets.
2. **Dependency Visualization Expansion:** The dependency parsing relies successfully on reading `package.json`. It can be expanded to catch Python (`requirements.txt`), Rust (`Cargo.toml`), or Go (`go.mod`) dynamically depending on the top hit from the Language API.
3. **UI Review:** Ensure responsive breakpoints (`md:`, `lg:`, `xl:`) are behaving flawlessly across the new `MergeGraph` component.

Please maintain the ultra-dark, neon-glassmorphism aesthetic exactly as implemented in phase 4 and 5. Avoid standard, flat web design. Use `<motion.div>` to establish flow. Use `lucide-react` for all iconography.

End of Context document. All clear and ready to proceed.
