# Context Handover: Gitviz UI/UX Enhancements

This document summarizes the recent features, architectural changes, and UI/UX improvements made to the **Gitviz** repository to provide full context for future LLM agents taking over the project.

## Current Branch

**Branch:** `feature/branch-merge-graph`
All changes discussed below have been committed to this branch.

---

## 1. Contributor Graph Redesign (Concentric Ring Topology)

**Goal:** Fix the readability issues of the previous `dagre` top-to-bottom graph which created long, confusing vertical chains of same-sized nodes with arbitrary edges.

**Implemented Changes:**

- **Files Modified:**
  - `src/components/diagrams/contributors-network.tsx`
  - `src/components/diagrams/nodes/contributor-node.tsx`
- **Layout Strategy:** Replaced the `dagre` layout with a custom **Concentric Ring (Pack) layout**.
  - **Center Node:** The #1 contributor sits at the exact center.
  - **Ring 1:** Contributors ranked 2–7.
  - **Ring 2:** Contributors ranked 8–19.
  - **Ring 3:** Contributors ranked 20–30.
- **Node Sizing:** Node size (and avatar size) now scales proportionally to the contributor's total commit count. The top contributor is naturally the largest node.
- **Visual Styling:**
  - **Medals:** Top 3 contributors automatically receive 🥇, 🥈, and 🥉 badges.
  - **Color Tiers:** Nodes are color-coded based on rank: Gold (#1) → Cyan (2-3) → Indigo (4-6) → Purple (7-10) → Slate (11+).
  - **Effects:** Avatars have background glow rings matching their tier color.
  - **Edges:** Removed confusing arbitrary dependency lines. Now, only very subtle, low-opacity lines connect the center node to Ring 1 to establish a visual anchor.

---

## 2. Branch Merge Graph (Vertical Git Topology)

**Goal:** Create a visual "git log --graph" style layout to show actual branch forks and merges, rather than just a linear list of isolated commits.

**Data Layer Implementations:**

- **`src/types/index.ts`:** Added the `MergedPR` interface to represent closed/merged pull requests.
- **`src/lib/github.ts`:** Added `fetchMergedPRs()` leveraging the GitHub Pull Requests API (`/pulls?state=closed&sort=updated&direction=desc&per_page=50`).
- **`fetchAllRepoData`:** Integrated `fetchMergedPRs` into the parallel `Promise.all` fetch so it loads simultaneously without adding latency. Propagated through `repo-page-client.tsx` down to the UI components.

**UI Layer Implementations (`src/components/diagrams/branch-graph.tsx` & `src/components/diagrams/merge-graph.tsx`):**

- **View Toggle:** Added a segmented control (Graph / Timeline) at the top of the Branches tab. The new Merge Graph is the default view.
- **Vertical Timeline Layout:** Built a completely custom, responsive vertical timeline showing merge PR events.
  - **Spine:** A vertical gradient line down the left side represents the `main` (or default) branch.
  - **Month Grouping:** PRs are grouped by month with clean visual separators and merge counts per month.
  - **Merge Cards:** Each merge event is a rich detail card containing:
    - A color-coded branch badge showing the flow: `feature/branch-name → main`. Branch colors are deterministically assigned.
    - PR Title and Number.
    - Author avatar, username, and "merged by [user]" data if merged by someone else.
    - Time elapsed since merge (e.g., "15d ago").
  - **Interactivity:** Clicking a PR card expands it to reveal the exact timestamp and an "Open in GitHub" external link. A node on the spine highlights when its corresponding PR is clicked.
  - **Pagination:** Added a "Load more PRs" button at the bottom that fetches the next page of 50 PRs from the GitHub API and elegantly appends them to the timeline.

---

## 3. Operational Notes & Edge Cases Handled

- **Pagination & Scaling Plan:** Since some repositories have 30,000+ commits, rendering every single commit in a GUI node graph is unfeasible. We rely on **Merge Events (PRs)** instead. A 30k commit repo only has a fraction of that in PRs. We load them in chunks of 50 to ensure the browser never freezes.
- **Disk Space / Cache Issues:** During development, the Next.js Turbopack `.next` cache accumulated rapidly causing `ENOSPC: no space left on device` errors on the VFS. This was resolved by cleaning npm caches, `/tmp/` files, and wiping `rm -rf .next` before dev server restarts.

## Next Steps for the Incoming Agent

1. **Review:** Read through `merge-graph.tsx` and `contributors-network.tsx` to familiarize yourself with the custom layouts implemented.
2. **Polish:** Review any UI inconsistencies or responsive design issues on smaller viewports.
3. **API Rate Limits:** The new `fetchMergedPRs` call utilizes the GitHub API. Ensure the `rateLimitHit` warning banner (already implemented in the timeline view) adequately covers the new graph view if the rate limit is exceeded.
4. **Testing:** Verify the graph against repositories that *don't* use PRs actively to ensure fallback UIs behave gracefully.
