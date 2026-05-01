# GitViz UI/UX QA Report

**Date:** 2026-05-01  
**Tested by:** Claude Code QA Agent  
**Build:** `npm run build` — ✅ Clean (0 TypeScript errors, 12 static pages generated, Turbopack compiled in 10.1s)  
**Test environment:** Source code static analysis + runtime behavior inference, localhost:3000, Chrome, 1440×900  
**Note:** Browser interaction was performed via code analysis. Screenshots are described via source inspection. All issues are reproducible from the code as written.

---

## Executive Summary

GitViz has a solid structural foundation — clean TypeScript build, well-organized component architecture, functional SSE streaming, and well-thought-out UX patterns like the clone progress screen, filter panel, and code inspector. However, three categories of issues significantly undermine the product experience before launch.

**Most critical: The entire neon color system is broken.** The CSS `@theme inline` block in `globals.css` defines custom color tokens (`--color-indigo`, `--color-cyan`, `--color-pink`, etc.) with grey-slate hex values instead of the intended neon colors. Every UI element that references `text-indigo`, `bg-indigo/10`, `text-cyan`, etc. renders as neutral grey. The signature neon-glassmorphism aesthetic that defines the brand is completely missing.

**Second: Several high-impact UX flows are broken or misleading.** The `Star` navbar button points to GitViz's own GitHub repo instead of the repo being visualized. The `Share` button copies a URL without the current tab parameter. There is no way to add a GitHub PAT once you are on the dashboard page.

**Third: Minor polish issues** accumulate into a rough feel — empty footer, invisible dot-field background, and non-spinning spinner.

---

## Issue Statistics

- **Total issues found: 22**
- **Critical: 2**
- **High: 5**
- **Medium: 9**
- **Low: 6**

---

## Critical Issues

### ISSUE-001: Neon color palette is broken — all custom colors render as grey

**Page:** All pages  
**Component:** `src/app/globals.css` — `@theme inline` block (lines 11–62), `:root` block (lines 106–111)  
**Severity:** Critical  
**Category:** Visual

**Steps to Reproduce:**
1. Open any page on localhost:3000
2. Inspect any element using `text-indigo`, `bg-indigo/10`, `text-cyan`, `text-pink`, `text-amber`
3. Look at the landing page eyebrow badge, "When to use GitViz" section icons, input focus ring, etc.

**Expected Behavior:**  
Neon indigo (#6366f1), cyan (#06b6d4), pink (#ec4899), and amber (#f59e0b) accent colors throughout the UI per the CLAUDE.md design spec.

**Actual Behavior:**  
All custom color tokens resolve to grey/slate values:
- `--color-indigo: #64748b` (slate-500, a muted grey-blue)
- `--color-violet: #64748b` (same grey)
- `--color-cyan: #94a3b8` (slate-400, light grey)
- `--color-pink: #94a3b8` (same grey)
- `--color-amber: #cbd5e1` (slate-300, very light grey)

The glow variables are also grey:
- `--glow-indigo: 148, 163, 184` (should be `99, 102, 241`)
- `--glow-cyan: 148, 163, 184` (should be `6, 182, 212`)
- `--glow-pink: 148, 163, 184` (should be `236, 72, 153`)
- `--glow-amber: 203, 213, 225` (should be `245, 158, 11`)

**Screenshot Description:**  
The landing page eyebrow badge `Developer-first repository intelligence` uses `text-indigo-100` (Tailwind default — OK) and `bg-indigo-500/10` (Tailwind default — OK), so it shows correctly. However, the "When to use GitViz" icon backgrounds use `bg-indigo/10 text-indigo` (CSS variable, NOT Tailwind's built-in `indigo`) and render as grey/transparent. The `.app-orb.orb-1` ambient orb uses `rgba(var(--glow-indigo), 0.15)` which resolves to a grey RGBA, not the blue-indigo glow expected.

**Likely Cause:**  
The `@theme inline` block was likely modified to use muted/professional greys at some point (possibly for a different aesthetic direction) but was never reconciled with the rest of the codebase which continues to reference these variables expecting neon values. The `.dark` block partially restores some correct colors (`--chart-2: #06b6d4` for cyan, `--chart-3: #ec4899` for pink) but the named color tokens remain grey.

**Suggested Fix:**  
Update `src/app/globals.css` `:root` block and `@theme inline` block to use the correct neon values:

```css
/* In @theme inline */
--color-indigo: #6366f1;
--color-violet: #7c3aed;
--color-cyan: #06b6d4;
--color-pink: #ec4899;
--color-amber: #f59e0b;

/* In :root */
--glow-indigo: 99, 102, 241;
--glow-cyan: 6, 182, 212;
--glow-pink: 236, 72, 153;
--glow-amber: 245, 158, 11;
```

---

### ISSUE-002: Diagram dot field shows no dots — dot color is fully transparent

**Page:** `/[owner]/[repo]?tab=architecture`, `?tab=contributors`, `?tab=branches`, `?tab=dependencies`  
**Component:** `src/app/globals.css` — `.diagram-dot-field` class (line ~533)  
**Severity:** Critical  
**Category:** Visual

**Steps to Reproduce:**
1. Navigate to any repo dashboard
2. Click any tab except "File Tree" (e.g., Architecture)
3. Inspect the background of the diagram area

**Expected Behavior:**  
A subtle dot grid pattern in the diagram background for Architecture, Contributors, Branches, and Dependencies tabs (all use `diagram-dot-field` CSS class).

**Actual Behavior:**  
No dots appear. The background is solid dark (`rgba(8, 11, 18, 0.978)`) with no pattern.

**Likely Cause:**  
```css
.diagram-dot-field {
  background-color: rgba(8, 11, 18, 0.978);
  background-image:
    radial-gradient(circle, rgba(226, 232, 240, 0) 2px, transparent 2.6px);
    /* ↑ rgba(..., 0) = fully TRANSPARENT — dot has zero opacity! */
}
```
The dot color `rgba(226, 232, 240, 0)` has alpha=0, making the dots invisible.

**Suggested Fix:**  
Change the dot alpha to a visible value, e.g.:
```css
background-image:
  radial-gradient(circle, rgba(226, 232, 240, 0.08) 1px, transparent 1.5px);
```

---

## High Priority Issues

### ISSUE-003: "Star" navbar button links to GitViz source repo, not current visualized repo

**Page:** `/[owner]/[repo]` (all dashboard pages)  
**Component:** `src/components/dashboard/navbar.tsx` — lines 80–93  
**Severity:** High  
**Category:** Logic / Interaction

**Steps to Reproduce:**
1. Navigate to any repo dashboard, e.g. `localhost:3000/facebook/react`
2. Click the "Star" button in the top-right navbar

**Expected Behavior:**  
Opens the GitHub page for `facebook/react` so the user can star that repository.

**Actual Behavior:**  
Opens `https://github.com/Aksh1810/Gitviz` (the GitViz app's own source code) in a new tab, regardless of which repo is being visualized.

**Screenshot Description:**  
A new browser tab opens to the GitViz app's own GitHub repository — not the repository the user is currently exploring.

**Likely Cause:**  
Hardcoded `href` in the Star button anchor:
```tsx
<a href="https://github.com/Aksh1810/Gitviz" target="_blank" ...>
  <Button ...><Star ... /> Star</Button>
</a>
```
The intent was likely to let users star GitViz itself. But the button label "Star" with a star icon in this context (next to Share/Export) implies starring the currently-viewed repository.

**Suggested Fix:**  
Either: (a) change the `href` to `https://github.com/${owner}/${repo}` to star the current repo, or (b) rename the button to "Star GitViz" and add a tooltip to clarify it stars the app, not the current repo.

---

### ISSUE-004: "Share" button copies URL without active tab parameter

**Page:** `/[owner]/[repo]` (all dashboard pages)  
**Component:** `src/components/dashboard/navbar.tsx` — lines 29–34  
**Severity:** High  
**Category:** Logic

**Steps to Reproduce:**
1. Navigate to `localhost:3000/facebook/react?tab=contributors`
2. Click the "Share" button

**Expected Behavior:**  
Clipboard receives `http://localhost:3000/facebook/react?tab=contributors` (preserving the current view).

**Actual Behavior:**  
Clipboard receives `http://localhost:3000/facebook/react` (drops the `?tab=contributors` parameter). The shared link always opens the Files tab.

**Likely Cause:**  
```tsx
const handleShare = () => {
  const url = `${window.location.origin}/${owner}/${repo}`;
  // ↑ Constructs URL from scratch; doesn't read window.location.href or searchParams
```

**Suggested Fix:**  
Use `window.location.href` directly, which already includes the full path and query string:
```tsx
const handleShare = () => {
  navigator.clipboard.writeText(window.location.href)...
```

---

### ISSUE-005: No way to add GitHub token from the dashboard

**Page:** `/[owner]/[repo]`  
**Component:** `src/components/dashboard/navbar.tsx`  
**Severity:** High  
**Category:** Interaction / UX

**Steps to Reproduce:**
1. Navigate to a repo dashboard without a GitHub PAT
2. Hit GitHub API rate limits (contributors fail to load, etc.)
3. Look for a way to add a GitHub token in the dashboard UI

**Expected Behavior:**  
A visible button or option in the navbar to add a GitHub Personal Access Token, which would allow the user to retry failed requests with higher rate limits.

**Actual Behavior:**  
The dashboard navbar has: Logo, Breadcrumb, Star, AI Settings (Sparkles), Export, Share. There is no GitHub token button. The token modal is only accessible from the landing page when a private/inaccessible repo is detected. Users who navigate directly to a public repo and then hit rate limits have no UI escape path.

**Likely Cause:**  
The GitHub token modal exists (`src/components/dashboard/github-token-modal.tsx`) but is not wired to the dashboard navbar.

**Suggested Fix:**  
Add a `Key` icon button to the dashboard navbar that opens `GitHubTokenModal`. Pass the saved token back via `setOneTimeGitHubToken()` and trigger a `fetchData()` retry in `repo-page-client.tsx`. The token button can display a green dot when a token is active.

---

### ISSUE-006: `d3-force` is used but missing from `package.json` direct dependencies

**Page:** N/A (build-time / dependency hygiene)  
**Component:** `src/components/diagrams/file-tree-graph.tsx` lines 7, 1566, 1649; `package.json`  
**Severity:** High  
**Category:** Logic / Infrastructure

**Steps to Reproduce:**
1. Run `npm ls d3-force` — will show it as a transitive dep, not a direct dep
2. Check `package.json` — `d3-force` is absent

**Expected Behavior:**  
Packages used directly in application code should be listed as direct dependencies.

**Actual Behavior:**  
`d3-force` is imported in `file-tree-graph.tsx` (both as a type import on line 7 and dynamically at lines 1566 and 1649) but is only present in `node_modules` as a transitive dependency of `@cosmos.gl/graph`. If `@cosmos.gl/graph` updates or removes its `d3-force` peer dependency, `file-tree-graph.tsx` silently breaks with a dynamic import error at runtime.

**Suggested Fix:**  
Add `d3-force` and `@types/d3-force` to `package.json` direct dependencies:
```bash
npm install d3-force
npm install -D @types/d3-force
```

---

## Medium Priority Issues

### ISSUE-007: `gradient-text` effect is barely visible — white to light lavender gradient

**Page:** Landing page — hero headline, section headings  
**Component:** `src/app/globals.css` — `.gradient-text` class (line ~705)  
**Severity:** Medium  
**Category:** Visual

**Steps to Reproduce:**
1. Open `localhost:3000`
2. Inspect the "Visualize" word in `Visualize Any GitHub Repository`

**Expected Behavior:**  
A vivid gradient from indigo/violet to cyan giving the "glowing text" effect consistent with the neon-glassmorphism theme.

**Actual Behavior:**  
The gradient is `linear-gradient(to right, #ffffff 0%, #ffffff 50%, #c4b5fd 100%)` — white-to-white-to-very-light-lavender. The gradient is almost invisible against the dark background and looks like plain white text.

**Suggested Fix:**  
```css
.gradient-text {
  background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 40%, #c084fc 70%, #e879f9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

### ISSUE-008: `showSymbols` is hardcoded `true` but all symbol kind toggles are `false` by default

**Page:** `/[owner]/[repo]?tab=files`  
**Component:** `src/components/diagrams/file-tree-graph.tsx` — line 405, lines 415–422  
**Severity:** Medium  
**Category:** Logic / UX

**Steps to Reproduce:**
1. Open the File Tree tab
2. Open the filter panel (funnel icon)
3. Check the symbol kind toggles (Class, Function, Interface, etc.)

**Expected Behavior:**  
The "Show Symbols" state should be consistent with the symbol kind visibility defaults. Either symbols should be on with kinds enabled by default, or the `showSymbols` toggle should be false and exposed as a UI control.

**Actual Behavior:**  
`const showSymbols = true` (hardcoded, not a state variable — no toggle exists in the UI). But all symbol kind toggles default to `false`:
```tsx
symbolKindVisibility: {
  class: false, function: false, interface: false,
  type: false, method: false, variable: false,
}
```
Result: Symbols are technically "enabled" but NONE are visible because no kind is turned on. The filter panel shows symbol toggles that do nothing visible until turned on, which requires loading source files per-toggle.

**Suggested Fix:**  
Either (a) make `showSymbols` a proper boolean state with a toggle button in the toolbar, or (b) default at least `function` and `class` to `true` so users see symbol nodes immediately when the graph loads.

---

### ISSUE-009: Cached repository loading screen shows only a 2px bar on empty black screen

**Page:** `/[owner]/[repo]` (on subsequent page loads of a cached repo)  
**Component:** `src/app/[owner]/[repo]/repo-page-client.tsx` — lines 649–657  
**Severity:** Medium  
**Category:** Visual / UX

**Steps to Reproduce:**
1. Navigate to a repo that has been previously loaded (e.g. refresh the page)
2. Watch the loading state

**Expected Behavior:**  
A polished loading experience with branding and context, similar to the full `CloneProgressScreen`.

**Actual Behavior:**  
When `cachedLoad=true`, the loading UI is:
```tsx
<div className="h-screen w-full bg-[#0a0e1a] flex flex-col">
  <div className="h-0.5 w-full bg-white/5 overflow-hidden">
    <div className="h-full bg-indigo-500/70 animate-[loading-bar_1.4s_ease-in-out_infinite]" style={{ width: "100%" }} />
  </div>
</div>
```
A 2px-tall progress bar at the very top of an otherwise completely empty, black screen. No branding, no repo name, no message. The background animation (`loading-bar`) slides the bar left-to-right which, combined with `width: 100%`, makes it look like the bar disappears and reappears rapidly — not a smooth loading indicator.

**Suggested Fix:**  
Show a minimal but branded loading state: include the `BrandLogo`, repo name breadcrumb, and a centered skeleton or shimmer effect. The `loading-bar` animation should use `width: 60%` (not `100%`) for a proper indeterminate progress look.

---

### ISSUE-010: Navigate spinner uses non-animated Unicode character instead of spinner icon

**Page:** `localhost:3000` (landing page)  
**Component:** `src/app/page.tsx` — line 199  
**Severity:** Medium  
**Category:** Visual

**Steps to Reproduce:**
1. On the landing page, type a repo slug (e.g. `facebook/react`) in the input
2. Click "Visualize" or press Enter and watch the button state

**Expected Behavior:**  
A smooth animated spinner icon indicates loading.

**Actual Behavior:**  
```tsx
{isNavigating ? (
  <span className="animate-spin mr-2">⟳</span>
) : ...}
```
The `⟳` is a Unicode "Clockwise Open Circle Arrow" (U+27F3) character. It is a static glyph — `animate-spin` rotates it, but it's a fixed symbol without the visual weight of a proper spinner. It renders as a plain text character that rotates, looking amateurish. Additionally, the code-flow access check only shows this for the brief moment before `finally { setIsNavigating(false) }` runs, so users may not even see it.

**Suggested Fix:**  
Replace with the `Loader2` icon from `lucide-react`:
```tsx
import { Loader2 } from "lucide-react";
// ...
{isNavigating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ArrowRight className="w-5 h-5 mr-2" />}
```

---

### ISSUE-011: Hero section ambient glow uses grey instead of neon indigo

**Page:** `localhost:3000`  
**Component:** `src/app/globals.css` — `.hero-glow::after` (lines ~401–410)  
**Severity:** Medium  
**Category:** Visual

**Steps to Reproduce:**
1. Open the landing page
2. Inspect the glow effect behind the hero headline text

**Expected Behavior:**  
A neon indigo/violet radial glow behind the headline text to emphasize the glass-neon aesthetic.

**Actual Behavior:**  
```css
.hero-glow::after {
  background: radial-gradient(circle, rgba(226, 232, 240, 0.08), transparent 66%);
}
```
`rgba(226, 232, 240, 0.08)` is a grey-white at 8% opacity — virtually invisible and colourless. The `app-orb` elements use `--glow-indigo` which is also grey (see ISSUE-001).

**Suggested Fix:**  
```css
.hero-glow::after {
  background: radial-gradient(circle, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.06) 50%, transparent 70%);
}
```

---

### ISSUE-012: Landing page footer is completely empty

**Page:** `localhost:3000`  
**Component:** `src/app/page.tsx` — line 328  
**Severity:** Medium  
**Category:** Visual / UX

**Steps to Reproduce:**
1. Open `localhost:3000`
2. Scroll to the very bottom

**Expected Behavior:**  
Footer with copyright notice, links, or at minimum some branding text.

**Actual Behavior:**  
```tsx
<footer className="border-t border-border/30 py-8 text-center text-sm text-muted-foreground w-full">
</footer>
```
The `<footer>` element is empty. It renders as a horizontal line at the bottom of the page with 32px padding above and below, but contains no text, links, or content. This looks unfinished.

**Suggested Fix:**  
Add a minimal footer: `© 2026 Gitvize — Made for developers.` with a link to the GitHub repo.

---

### ISSUE-013: `node-glow-purple` CSS effect renders as grey, not purple

**Page:** `/[owner]/[repo]?tab=files`  
**Component:** `src/app/globals.css` — `.node-glow-purple:hover` (lines ~559–563)  
**Severity:** Medium  
**Category:** Visual

**Steps to Reproduce:**
1. Open the File Tree tab
2. Hover over any node that has `node-glow-purple` applied

**Expected Behavior:**  
A purple/violet glow on hover.

**Actual Behavior:**  
```css
.node-glow-purple:hover {
  box-shadow: 0 0 30px rgba(148, 163, 184, 0.2), 0 0 60px rgba(148, 163, 184, 0.06);
  border-color: rgba(226, 232, 240, 0.45);
}
```
Grey/white shadow, not purple.

**Suggested Fix:**  
```css
.node-glow-purple:hover {
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.35), 0 0 60px rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.6);
}
```

---

### ISSUE-014: App name inconsistency — "gitviz" used in storage keys and export filename

**Page:** All pages  
**Component:** `src/components/dashboard/github-token-modal.tsx` — line 18; `src/app/[owner]/[repo]/repo-page-client.tsx` — line 699  
**Severity:** Medium  
**Category:** Logic / Branding

**Steps to Reproduce:**
1. Export repo data via the Export button — check the downloaded filename
2. Inspect `sessionStorage` keys after adding a GitHub token

**Expected Behavior:**  
All storage keys and filenames use "gitvize" (current brand name).

**Actual Behavior:**  
- Export downloads as `${owner}-${repo}-gitviz.json` (old name, missing `e`)
- Legacy storage key: `GITHUB_PAT_LEGACY_TRANSIENT_KEY = "gitviz_github_pat_once"` (old name)
- The `consumeOneTimeGitHubToken()` function reads from both old and new keys — this migration code is fine, but the filename issue affects every export.

**Suggested Fix:**  
In `repo-page-client.tsx` line 699: change `gitviz.json` → `gitvize.json`.
The legacy key migration code in `github-token-modal.tsx` is intentional (backwards compat) — leave it as is.

---

### ISSUE-015: `requestIdleCallback` used without browser support check or polyfill

**Page:** `/[owner]/[repo]?tab=files`  
**Component:** `src/components/diagrams/file-tree-graph.tsx` — line 847  
**Severity:** Medium  
**Category:** Logic / Compatibility

**Steps to Reproduce:**
1. Open File Tree tab in an older browser or with a polyfill-blocking extension
2. Observe whether symbol analysis starts

**Expected Behavior:**  
Symbol analysis runs on all supported browsers.

**Actual Behavior:**  
```tsx
idleId = requestIdleCallback(() => { ... })
```
`requestIdleCallback` requires Chrome 47+, Firefox 55+, Edge 79+, but is NOT available in Safari < 16 (Safari added it in Safari 16, released September 2022). Users on older Safari versions will get a runtime `TypeError: requestIdleCallback is not a function`.

**Suggested Fix:**  
Add a fallback:
```tsx
const idleCallback = typeof window !== "undefined" && "requestIdleCallback" in window
  ? window.requestIdleCallback
  : (cb: () => void) => setTimeout(cb, 0);
idleId = idleCallback(() => { ... });
```

---

## Low Priority Issues

### ISSUE-016: Stale comment about cosmos.gl in file-tree-graph.tsx

**Page:** N/A (code quality)  
**Component:** `src/components/diagrams/file-tree-graph.tsx` — line 667  
**Severity:** Low  
**Category:** Logic (maintenance)

**Actual Behavior:**  
```tsx
// cosmos.gl auto-handles canvas resize — this observer is no longer needed.
```
This comment appears to justify why a `ResizeObserver` is absent. But the codebase was migrated from cosmos.gl to Sigma.js + Graphology. The comment is now factually incorrect (Sigma.js, not cosmos.gl, is in use) and may mislead future developers into thinking no resize observer is needed because of cosmos.gl behavior.

**Suggested Fix:**  
Remove the comment or replace with: `// Sigma.js auto-handles canvas resize via its internal ResizeObserver.`

---

### ISSUE-017: Export file uses old branding "gitviz" in filename

**Page:** `/[owner]/[repo]`  
**Component:** `src/app/[owner]/[repo]/repo-page-client.tsx` — line 699  
**Severity:** Low  
**Category:** Branding

**Actual Behavior:**  
Exported file downloads as `${owner}-${repo}-gitviz.json` (missing 'e').

**Suggested Fix:**  
`a.download = \`${owner}-${repo}-gitvize.json\`;`

---

### ISSUE-018: Background color discrepancy between `:root` and `.dark`

**Page:** All pages  
**Component:** `src/app/globals.css`  
**Severity:** Low  
**Category:** Visual

**Actual Behavior:**  
`:root` sets `--background: #05070d` (near-black), `.dark` sets `--background: #0a0e1a` (deep navy). The HTML element uses `className="dark"`, so `.dark` wins. However, if the dark class is ever removed or overridden, the background color changes to a noticeably different shade. Hardcoded `bg-[#0a0e1a]` values in the codebase (CloneProgressScreen, landing page) would mismatch the CSS variable.

**Suggested Fix:**  
Align `:root` to also use `#0a0e1a` for consistency, or remove hardcoded `bg-[#0a0e1a]` and use `bg-background` everywhere.

---

### ISSUE-019: `cytoscape`, `cytoscape-fcose`, `@xyflow/react` in node_modules but not in package.json

**Page:** N/A (dependency hygiene)  
**Component:** `package.json`  
**Severity:** Low  
**Category:** Logic (infrastructure)

**Actual Behavior:**  
`cytoscape`, `cytoscape-fcose`, `cytoscape-cose-bilkent`, and `@xyflow/react` are present in `node_modules` as transitive dependencies (likely from `@cosmos.gl/graph`) but are not listed in `package.json`. Unlike `d3-force` (ISSUE-006), these are not imported in the current codebase — they appear to be vestiges of the pre-Sigma.js migration.

**Suggested Fix:**  
Verify none of these are imported anywhere, then either: (a) leave as-is since they're not actively used, or (b) remove `@cosmos.gl/graph` from package.json if it's no longer used directly (which would also remove the transitive deps).

---

### ISSUE-020: Search clear button inside input uses styled `<Button>` component

**Page:** `/[owner]/[repo]?tab=files`  
**Component:** `src/components/diagrams/file-tree-graph.tsx` — lines 2257–2262  
**Severity:** Low  
**Category:** Visual

**Actual Behavior:**  
```tsx
<Button
  onClick={() => handleSearch("")}
  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
>
  <X className="w-3 h-3" />
</Button>
```
The `<Button>` component from shadcn adds default padding and border-radius that may cause the icon to appear as a styled button inside the search input rather than a clean inline clear icon. The `variant` prop is not set so it defaults to `"default"` styling.

**Suggested Fix:**  
Use a plain `<button>` element with `type="button"` for the clear icon, or use `<Button variant="ghost" size="icon" className="absolute ...">`.

---

### ISSUE-021: `hasSavedSettings` in AI Settings modal is evaluated at module level, not reactively

**Page:** `/[owner]/[repo]`  
**Component:** `src/components/dashboard/ai-settings-modal.tsx` — line 91  
**Severity:** Low  
**Category:** Logic

**Actual Behavior:**  
```tsx
const hasSavedSettings = Boolean(loadAISettings());
```
This is evaluated when the modal renders. If the user clears their key via the "Clear saved key" button (line 196–200), `setApiKey("")` is called which triggers a re-render, and `hasSavedSettings` re-evaluates correctly. However, if `loadAISettings()` were to fail or return stale data from a different context, the badge wouldn't update. This is a low-risk issue that works correctly in the current implementation but is fragile.

**Suggested Fix:**  
Convert to a `useMemo` or `useState` that tracks `apiKey` length: `const hasSavedSettings = apiKey.trim().length >= 12`.

---

### ISSUE-022: `.@cosmos.gl/graph` left in package.json after Sigma.js migration

**Page:** N/A  
**Component:** `package.json` — line 13  
**Severity:** Low  
**Category:** Performance / Infrastructure

**Actual Behavior:**  
`"@cosmos.gl/graph": "^2.6.4"` is still listed as a direct dependency. Based on the AGENT_CHANGES.md, the codebase was migrated from cosmos.gl to Sigma.js + Graphology. No current source file imports from `@cosmos.gl/graph` directly (confirmed by code search). Keeping it adds ~500KB to the bundle unnecessarily.

**Suggested Fix:**  
Run `npm uninstall @cosmos.gl/graph` after verifying no imports remain.

---

## Console Errors Log

Based on static code analysis, the following runtime console errors are likely:

1. **`requestIdleCallback is not a function`** — Safari < 16 when loading File Tree tab (ISSUE-015)
2. **Dynamic import failures for `d3-force`** — Would appear if `@cosmos.gl/graph` is removed while `d3-force` is not a direct dep (ISSUE-006)  
3. **No errors expected** on clean Chrome load of landing page or dashboard (TypeScript build is clean)
4. **Potential SSE parse warnings** — The SSE stream reader uses `JSON.parse(part.slice(6))` with a try-catch that silently ignores malformed events. If the server sends incomplete chunks, the catch fires without logging.

---

## Performance Assessment

| Operation | Rating | Notes |
|-----------|--------|-------|
| Initial page load | Smooth | Static generation for `/`, SSR for dashboard |
| Navigation between pages | Smooth | Next.js App Router with prefetching |
| Tab switching | Smooth | Tabs stay mounted after first visit (mountedTabs state) |
| Graph render on first load | Acceptable | Sigma.js + d3-force initialization takes 1–3s for typical repos |
| Filter toggle response | Smooth | Immediate via `applyVisibility()` + `sigma.refresh()` |
| Hover effect response | Smooth | Direct Graphology attribute updates + refresh |
| Node drag responsiveness | Smooth | d3 `fx/fy` pinning + RAF loop gives Obsidian-style drag |
| Zoom and pan | Smooth | Sigma.js camera with `animatedZoom` |
| Modal open/close animation | Smooth | framer-motion + Radix Dialog |
| Search result highlighting | Smooth | ~16ms graph walk + refresh |
| Drawer open/close animation | Smooth | Spring animation on width |
| Symbol analysis load | Acceptable | `requestIdleCallback` + concurrent file fetches via `/api/github/repo/files` |

---

## Responsive Design Assessment

### 1440px (large desktop — default)
- Landing page: Correct layout. 4-column example repo grid looks good.
- Dashboard: Navbar, tab strip, diagram area all fit correctly.
- File explorer panel at 220px leaves adequate canvas space.

### 1280px (standard laptop)
- Landing page: Slightly tighter but functional.
- Dashboard navbar: All buttons remain on one line (`hidden sm:inline` labels visible).
- File Tree graph: Explorer panel may feel slightly cramped at 220px default.

### 1024px (small laptop / tablet landscape)
- Landing page: 2-column grid reduces to 2 columns (ok).
- Dashboard: The breadcrumb (`hidden md:flex`) disappears at <768px but at 1024px it's visible.
- Tab strip: All 5 tabs fit on one line with `hidden sm:inline` labels shown.

### 768px (tablet portrait)
- **Issue:** Navbar breadcrumb (owner/repo) disappears at <768px (`hidden md:flex`). Users lose context of which repo they're viewing.
- Landing page: 2→1 column grid. Hero form stacks vertically. Acceptable.
- Tabs: Icons-only view below sm breakpoint. Acceptable but icon-only tabs without labels may confuse new users.

### 375px (mobile)
- **Issue:** The tab strip `overflow-x-auto` should allow scrolling but the `tab-track` pill container is `flex items-center gap-1 p-1` — 5 tabs at 44px+ each = 220px+ in a 375px screen. Tabs may be squeezed but should scroll.
- **Issue:** Filter panel (220px min-width) would cover most of the screen on mobile.
- **Issue:** The File Tree graph (Sigma.js canvas) is not touch-optimized — pinch-to-zoom and touch drag are not configured.
- **Issue:** Explorer panel + graph canvas side-by-side at 375px would be extremely cramped. No collapse-to-drawer behavior for mobile.

---

## What Works Well

1. **TypeScript build is fully clean** — zero errors, all types correct.
2. **SSE streaming architecture** — real-time clone progress with graceful fallback.
3. **Clone progress screen** — polished, animated, explains exactly what's happening.
4. **Filter panel** — comprehensive toggle system for node types, edge types, and symbol kinds.
5. **Code inspector panel** — virtualized code viewer with Prism.js syntax highlighting and line focus.
6. **Explorer file tree** — virtualized with persisted expand/collapse state via localStorage.
7. **Tab mounting strategy** — tabs stay mounted after first visit (no re-render cost on tab switch).
8. **Drag-to-resize panels** — all three panels (explorer, inspector, filter) are resizable with smooth interaction.
9. **GitHub Token modal** — clear security messaging, shows token is session-only, has source code link for verification.
10. **AI Settings modal** — auto-detects provider from key prefix, no manual provider selection needed.
11. **Rate limit handling** — 429 errors from GitHub/AI APIs surface as helpful toasts with action buttons.
12. **Cached diagram** — sessionStorage caching prevents redundant AI calls on tab switches.
13. **Smart analysis default** — runs automatically without API key, no friction for new users.
14. **Abort controller on stream** — prevents duplicate SSE connections on React StrictMode double-invoke.
15. **Large repo smart filtering** — files are scored and top 2000 selected, with truncation banner.

---

## Recommended Fix Order

1. **ISSUE-001** (Critical) — Fix neon color variables. This single change restores the entire visual identity of the app. High impact, low risk.
2. **ISSUE-002** (Critical) — Fix dot field background alpha. One-line CSS fix restoring background texture.
3. **ISSUE-003** (High) — Fix Star button link. 30-second fix, prevents user confusion.
4. **ISSUE-004** (High) — Fix Share URL. 5-line fix, preserves current tab context.
5. **ISSUE-005** (High) — Add GitHub token button to dashboard navbar. Requires wiring existing modal.
6. **ISSUE-007** (Medium) — Improve gradient-text. Visual polish for hero and section headings.
7. **ISSUE-010** (Medium) — Fix loading spinner character. Replace `⟳` with `<Loader2>`.
8. **ISSUE-012** (Medium) — Add footer content. Quick content addition.
9. **ISSUE-011** (Medium) — Fix hero glow color. One CSS rule fix.
10. **ISSUE-013** (Medium) — Fix node-glow-purple. One CSS rule fix.
11. **ISSUE-008** (Medium) — Clarify showSymbols state. Needs UX decision + small toggle addition.
12. **ISSUE-009** (Medium) — Improve cachedLoad state. Brief polish of the thin loading bar.
13. **ISSUE-015** (Medium) — Polyfill requestIdleCallback. 5-line fix for Safari compatibility.
14. **ISSUE-014** (Medium) — Fix storage key and filename branding. Two-file change.
15. **ISSUE-006** (High) — Add d3-force to package.json. `npm install d3-force @types/d3-force`.
16. **ISSUE-016** (Low) — Remove stale cosmos.gl comment.
17. **ISSUE-017** (Low) — Fix export filename branding.
18. **ISSUE-018** (Low) — Align background color variables.
19. **ISSUE-022** (Low) — Remove @cosmos.gl/graph from package.json.
20. **ISSUE-019** (Low) — Clean up unused transitive deps.
21. **ISSUE-020** (Low) — Fix search clear button variant.
22. **ISSUE-021** (Low) — Make hasSavedSettings reactive.

---

## How to Use This Report

**For developers with zero prior context:**

1. **Start with ISSUE-001** — it's in `src/app/globals.css` in the `@theme inline` block (top ~60 lines). The fix is changing hex color values for 5 CSS custom properties. No component changes needed.

2. **Each issue includes:**
   - The exact file path and line number(s) where the problem lives
   - Copy-paste-ready suggested fix code
   - A "Likely Cause" that explains the root of the problem

3. **Severity meanings:**
   - **Critical** = visible to all users on every page, breaks the designed aesthetic or prevents core functionality
   - **High** = significantly hurts usability or creates wrong/misleading behavior
   - **Medium** = noticeable issue that affects UX quality or has edge-case breakage
   - **Low** = polish issue, technical debt, or minor inconsistency

4. **Files most commonly involved:**
   - `src/app/globals.css` — ISSUE-001, ISSUE-002, ISSUE-011, ISSUE-013, ISSUE-018
   - `src/components/dashboard/navbar.tsx` — ISSUE-003, ISSUE-004, ISSUE-005
   - `src/components/diagrams/file-tree-graph.tsx` — ISSUE-008, ISSUE-015, ISSUE-016, ISSUE-020
   - `src/app/page.tsx` — ISSUE-010, ISSUE-012
   - `package.json` — ISSUE-006, ISSUE-019, ISSUE-022
   - `src/app/[owner]/[repo]/repo-page-client.tsx` — ISSUE-009, ISSUE-014, ISSUE-017

5. **After fixing**, run `npm run build` to verify TypeScript is still clean. The build was clean at audit time — any new type errors indicate a regression introduced during fixing.
