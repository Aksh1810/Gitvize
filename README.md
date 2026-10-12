# Gitvize

Explore a GitHub repository through interactive file graphs, architecture diagrams, dependencies, branches, and contributor views.

Gitvize uses Next.js 16, React 19, and TypeScript. Graphology and Sigma.js power the file graph; Mermaid renders architecture diagrams. Public repositories and Smart architecture diagrams work without API keys, subject to GitHub's API limits.

## Run locally

Use Node.js 24 and npm to match the test workflow.

```bash
git clone https://github.com/Aksh1810/Gitvize.git
cd Gitvize
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is occupied, use the URL printed by Next.js, or choose a port explicitly:

```bash
npm run dev -- --port 3001
```

To run a production build locally:

```bash
npm run build
npm start
```

`npm run build` creates the production output and exits. `npm start` serves that build, normally on port 3000. The build fetches Space Grotesk and JetBrains Mono through `next/font/google`, so it needs access to Google Fonts.

## Use Gitvize

1. Enter a GitHub repository URL, such as `https://github.com/facebook/react`.
2. Explore **File Tree**, **Architecture**, **Contributors**, **Branches**, and **Dependencies**.
3. Search for files by name or path, select a file to inspect its source, and use the graph filters to show relationships.
4. In Architecture, switch between **Overview** and **Key files**. Smart diagrams work without an AI key; add a key through **AI settings** to request Premium diagrams.
5. Use the header actions to copy the page link or export repository data as JSON.

### Views and features

| View | Features |
| --- | --- |
| File Tree | Interactive graph, file explorer, source inspection, symbol relationships, search, and impact highlighting. Large repositories use a bounded selection of files to keep the graph usable. |
| Architecture | Smart diagrams generated from repository structure, optional AI generation, branch-aware file links, pan/zoom, SVG export, and Mermaid source copying. |
| Dependencies | Searchable package cards with versions, categories, dependency types, and ecosystem-specific links. Parses `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, and `pyproject.toml`. |
| Branches and commits | Branch visualization and a scrollable commit history with search and pagination. |
| Contributors | Contributor network, avatars, and contribution summaries. |

The dashboard also shows repository metadata, language statistics, and activity charts. File and dependency relationships are inferred from the available repository data; Smart diagrams provide an overview rather than a complete runtime architecture.

## Optional configuration

For local server settings, create `.env.local` in the repository root and restart the development server after changes. Basic repository exploration does not require an environment file or database.

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Default server token for GitHub requests, useful for API limits and repositories the token can access. |
| `GITHUB_TOKENS` | Optional comma-separated token pool used by the GitHub fetch helper. |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | A Gemini key or comma-separated key pool for Premium AI generation. |
| `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL` | Generic AI configuration. Supported providers are `openai`, `anthropic`, and `gemini`; dedicated Gemini keys take precedence over these defaults. |
| `AI_BASE_URL` | Optional base URL for server-configured AI requests. |
| `DATABASE_URL` | Optional PostgreSQL connection for the Drizzle client in `src/db/`. |

You can also enter a GitHub token through **GitHub token** in the header. **AI settings** accepts Gemini, OpenAI, or Anthropic keys and selects the provider and model from the key prefix. AI settings are saved in the browser's session storage. GitHub and AI requests pass through Gitvize's server, including keys supplied for those requests.

`.gitignore` excludes local environment files. A root `.env.example` is allowed as a shareable template; use placeholders rather than real credentials if you add one.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Compile and type-check the production build. |
| `npm start` | Serve an existing production build. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Jest suite once. |
| `npm run test:watch` | Re-run tests affected by local edits. |
| `npm run test:coverage` | Generate coverage reports in `coverage/`. |

### Testing

Tests use [Next.js's Jest integration](https://nextjs.org/docs/app/guides/testing/jest), React Testing Library, and jsdom. Add `.test.ts` or `.test.tsx` files under `__tests__/`; the `@/` alias resolves to `src/`. Pure Node tests can use a `/** @jest-environment node */` file header.

The initial suite covers file search, dependency parsing and metadata, architecture diagram limits and links, unique Mermaid node IDs, and clipboard success and failure handling. Tests run without GitHub tokens, AI keys, or external API calls. Coverage reports currently include only modules imported by the tests.

[The test workflow](.github/workflows/test.yml) runs `npm ci` and `npm test -- --ci` on pull requests and pushes to `main`, using Node.js 24. It runs Jest; production builds and linting are separate local commands.

## Project structure

```text
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── [owner]/[repo]/          # Repository dashboard
│   └── api/
│       ├── analyze/            # Smart and Premium architecture analysis
│       ├── github/repo/        # Repository, access, files, commits, and stream endpoints
│       └── graph/seed/         # Initial graph layout positions
├── components/
│   ├── charts/                 # Language and activity charts
│   ├── dashboard/              # Navigation, settings, and repository summaries
│   ├── diagrams/               # File, architecture, dependency, and contributor views
│   ├── motion/                 # Shared animation provider
│   └── ui/                     # Reusable UI components
├── db/                         # Optional PostgreSQL client and Drizzle schema
├── lib/                        # Data fetching, parsers, graph generation, search, and caches
├── types/                      # Shared TypeScript definitions
├── workers/                    # Graph simulation and symbol analysis workers
└── proxy.ts                    # Request middleware
__tests__/                      # Jest unit and component tests
.github/workflows/test.yml      # Automated test workflow
public/                         # Logos and static assets
jest.config.mjs                 # Next.js/Jest configuration and import alias
jest.setup.ts                   # Testing Library matchers
```

Generated dependencies, build output, coverage reports, logs, and local tooling files are excluded by `.gitignore`. Keep `package-lock.json`, test files, and configuration files in version control so `npm ci` and CI remain reproducible.

## License

MIT

Built by [Aksh1810](https://github.com/Aksh1810).
