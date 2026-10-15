# UI redesign

## Direction

### Consistency and themes — October 15

- Added a single light/dark toggle to the homepage and workspace using the installed `next-themes` package. Light is the default; the preference persists across navigation and reloads.
- Shared paper, surface, ink, muted, border, accent, and selection tokens now drive both pages, loading states, and dialogs.
- Every repository view uses the same heading placement, explanatory text, content spacing, and navigation. Removed repeated editorial slogans and staggered package-card entrances.
- Contributor, dependency, and commit-history surfaces adapt to the selected theme. File/code and architecture canvases intentionally remain dark work surfaces in both modes.
- Browser-verified dark homepage persistence after reload, navigation into the workspace, light/dark controls, light settings dialog, mobile dependency/architecture layouts at 390px, and light commit graph readability. Viewport reset afterward.
- 38 tests and TypeScript pass. Production build passed before the final style-only commit-history panel correction; tests and TypeScript were rerun afterward. Changed-file lint has existing hook/image warnings and no errors.

A blue-and-ink code atlas: a light landing page introduces the product, while the dark repository workspace keeps graphs and code readable. Existing fonts, Radix controls, Lucide icons, and Motion remain in use. No dependencies were added.

References reviewed: [Deck Gallery](https://deck.gallery), [Animos](https://animos.app), [Godly](https://godly.design), [Transitions](https://transitions.dev), [Backgrounds Supply](https://backgrounds.supply), [ObsidianUI](https://www.obsidianui.dev/components), and [OpenSource UI](https://opensourceui.in/components). The most applicable patterns were ObsidianUI's dashboard shell, OpenSource UI's dot-grid/editor surfaces, and Transitions' panel and state transitions. The implementation is original; no paid assets or third-party component source was copied.

## Changes

- Rebuilt landing page, repository entry, interactive illustrative file map, examples, and explanatory sections.
- Added a desktop navigation rail with a horizontally scrollable mobile view selector.
- Restyled repository summaries, contributor lists, dependency cards, branch history, architecture controls, loading, and error states.
- Reserved layout space for graph controls and made mobile history pagination wrap.
- Added accessible names, visible focus, scrollable dialogs, and inert collapsed graph panels. Help now uses the existing Radix dialog for focus management and Escape dismissal.
- Kept token validation inside the dialog until success; retained failures for retry. Corrected token handling copy to acknowledge server-mediated GitHub requests.
- Validated repository input, normalized `.git` suffixes, and separated service/rate-limit failures from private-repository prompts.
- Changed the AI settings action to “Save settings” to match its actual behavior.

## Verification

- 36 Jest tests pass, including parser cases, demo inspection, asynchronous token success/failure, branch filtering, dialog focus restoration, and file-tree failure propagation.
- TypeScript passes. Production build passes with network access for the existing Google Fonts.
- Changed-file ESLint passes with existing warnings. Full-repository lint still reports six existing errors in `knowledge-graph.tsx` and `github.ts`.
- Browser checks cover landing validation and preview, public repository loading and retry, all five views, file search and README inspection, graph zoom/fit and filter toggles, contributor and commit empty searches, dependency search/sort, settings/help dialogs, and mobile layouts at 390 × 844.
- Mobile landing and workspace have no page-level horizontal overflow; the view selector scrolls intentionally.
- JSON and SVG export completed through native Save dialogs; the populated JSON matches workspace counts and the SVG includes expected module labels. Share success was confirmed through its toast and clipboard URL.
- Live private-repository token authentication, paid AI generation, exhaustive large-repository cases, and every browser/device were not tested.

All changes are uncommitted. The running development server remains available at `http://localhost:3000`.

See [the follow-up UI/UX audit](ui-ux-audit.md) for reproduced bugs, fixes, and remaining verification limits.
