// ============================================================================
// GitViz — Universal GitDiagram-style Mermaid Code Generator
// ============================================================================
// Generates detailed Mermaid flowchart code from ANY repository's file tree.
// Robust character escaping, smart file selection for large repos, and
// universal edge inference (not project-specific).

import { TreeItem, ArchitectureAnalysis } from "@/types";

/* ------------------------------------------------------------------ */
/*  Safe string helpers                                                */
/* ------------------------------------------------------------------ */

/** Create a valid Mermaid node ID from any path */
function safeId(path: string): string {
    return "n_" + path.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/_$/, "");
}

/** Escape a string for use inside Mermaid quoted labels ["..."] */
function safeLabel(text: string): string {
    return text
        .replace(/"/g, "'")
        .replace(/[[\]{}()#&;`]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/* ------------------------------------------------------------------ */
/*  File classification                                                */
/* ------------------------------------------------------------------ */

type ArchLayer = "app" | "ui" | "logic" | "test" | "config" | "docs" | "other";

interface ClassifiedFile {
    path: string;
    name: string;           // filename only
    baseName: string;       // filename without ext
    ext: string;
    dir: string;            // parent directory path
    layer: ArchLayer;
    mermaidClass: string;   // classDef name
    label: string;          // human-readable label for the node
}

const LAYER_META: Record<ArchLayer, { subgraphLabel: string; mermaidClass: string }> = {
    config: { subgraphLabel: "Dev / Tooling / Config", mermaidClass: "platform" },
    app: { subgraphLabel: "App Routes / Pages", mermaidClass: "ui" },
    ui: { subgraphLabel: "UI / View Components", mermaidClass: "ui" },
    logic: { subgraphLabel: "Core Logic / Hooks / Services", mermaidClass: "core" },
    test: { subgraphLabel: "Tests", mermaidClass: "test" },
    docs: { subgraphLabel: "Documentation", mermaidClass: "doc" },
    other: { subgraphLabel: "Other", mermaidClass: "platform" },
};

function classifyFile(path: string): { layer: ArchLayer; roleLabel: string } {
    const lower = path.toLowerCase();
    const name = path.split("/").pop() || "";
    const baseName = name.replace(/\.\w+$/, "");
    const ext = name.split(".").pop() || "";

    // Tests
    if (lower.includes("test") || lower.includes("spec") || lower.includes("__tests__") || lower.includes("__mocks__"))
        return { layer: "test", roleLabel: baseName };

    // Root-level config files (no directory)
    if (!path.includes("/")) {
        if (ext === "md") return { layer: "docs", roleLabel: name };
        return { layer: "config", roleLabel: name };
    }

    // App routes / pages
    if (lower.includes("/app/") || lower.includes("/pages/")) {
        if (name === "layout.tsx" || name === "layout.ts" || name === "layout.js" || name === "layout.jsx")
            return { layer: "app", roleLabel: "Layout" };
        if (name === "page.tsx" || name === "page.ts" || name === "page.js" || name === "page.jsx") {
            const parts = path.split("/");
            const dir = parts.length > 2 ? parts[parts.length - 2] : "home";
            return { layer: "app", roleLabel: dir === "app" ? "Home" : dir };
        }
        return { layer: "app", roleLabel: baseName };
    }

    // Components / UI
    if (lower.includes("/components/") || lower.includes("/component/") || lower.includes("/ui/"))
        return { layer: "ui", roleLabel: baseName };

    // Everything "logic": hooks, core, engine, api, lib, utils, types, services, models
    if (
        lower.includes("/hooks/") || lower.includes("/hook/") || name.startsWith("use") ||
        lower.includes("/core/") || lower.includes("/engine/") || lower.includes("/domain/") ||
        lower.includes("/models/") || lower.includes("/model/") ||
        lower.includes("/api/") || lower.includes("/routes/") || name === "route.ts" || name === "route.js" ||
        lower.includes("/lib/") || lower.includes("/utils/") || lower.includes("/util/") ||
        lower.includes("/helpers/") || lower.includes("/shared/") ||
        lower.includes("/types/") || name.includes("types.") || name.includes(".d.ts") ||
        lower.includes("/services/") || lower.includes("/middleware/")
    )
        return { layer: "logic", roleLabel: baseName };

    // Docs
    if (ext === "md" || lower.includes("/docs/") || lower.includes("/doc/"))
        return { layer: "docs", roleLabel: baseName };

    // Config directories
    if (lower.includes("/config/") || lower.includes("/scripts/") || lower.includes("/.github/") ||
        lower.includes("/public/") || lower.includes("/assets/") || lower.includes("/static/") ||
        ext === "css" || ext === "scss" || ext === "sass" || lower.includes("/styles/"))
        return { layer: "config", roleLabel: baseName };

    // Source files default
    if (ext === "tsx" || ext === "jsx") return { layer: "ui", roleLabel: baseName };
    if (ext === "ts" || ext === "js") return { layer: "logic", roleLabel: baseName };

    return { layer: "other", roleLabel: baseName };
}

function scorePathForArchitecture(path: string): number {
    const lower = path.toLowerCase();
    const name = lower.split("/").pop() || "";
    let score = 0;

    if (!path.includes("/")) score += 30;
    if (name === "package.json" || name === "tsconfig.json" || name === "next.config.ts") score += 35;
    if (name === "layout.tsx" || name === "layout.ts") score += 45;
    if (name === "page.tsx" || name === "page.ts") score += 42;
    if (name === "route.ts" || name === "route.js") score += 40;
    if (name.startsWith("index.") || name.startsWith("main.") || name.startsWith("app.")) score += 28;

    if (lower.includes("/app/")) score += 24;
    if (lower.includes("/api/")) score += 22;
    if (lower.includes("/components/")) score += 18;
    if (lower.includes("/lib/") || lower.includes("/core/") || lower.includes("/services/")) score += 16;
    if (lower.includes("/types/")) score += 12;
    if (lower.includes("/test") || lower.includes(".spec.") || lower.includes(".test.")) score += 8;
    if (lower.endsWith(".md")) score -= 4;

    const depth = path.split("/").length;
    score += Math.max(0, 6 - depth);

    return score;
}

function computeAdaptiveMaxFiles(tree: TreeItem[]): number {
    const blobCount = tree.filter((t) => t.type === "blob").length;
    if (blobCount <= 80) return 28;
    if (blobCount <= 200) return 36;
    if (blobCount <= 500) return 46;
    if (blobCount <= 1200) return 56;
    return 64;
}

/* ------------------------------------------------------------------ */
/*  Smart file selection for large repos                               */
/* ------------------------------------------------------------------ */

/** Pick the most architecturally important files, capped at maxFiles */
function selectImportantFiles(tree: TreeItem[], maxFiles: number = 60): TreeItem[] {
    const blobs = tree.filter(t => t.type === "blob");

    // Priority tiers
    const tier1: TreeItem[] = []; // Entry points, configs
    const tier2: TreeItem[] = []; // Source code (ts/tsx/js/jsx/py/go/rs)
    const tier3: TreeItem[] = []; // Other files

    const codeExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "rb", "vue", "svelte", "astro"]);
    const skipExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot", "mp4", "mp3", "zip", "tar", "gz", "lock"]);
    const skipPaths = ["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__", ".cache"];

    for (const blob of blobs) {
        const ext = blob.path.split(".").pop()?.toLowerCase() || "";
        const lower = blob.path.toLowerCase();

        // Skip binary / build artifacts
        if (skipExts.has(ext)) continue;
        if (skipPaths.some(p => lower.includes(p))) continue;

        const name = blob.path.split("/").pop() || "";

        // Tier 1: entry points, package manifests, configs
        if (
            name === "package.json" || name === "tsconfig.json" || name === "README.md" ||
            name.includes("config") || name.includes("rc.") || name.includes(".config.") ||
            name === "layout.tsx" || name === "layout.ts" ||
            name === "page.tsx" || name === "page.ts" ||
            name.startsWith("index.") || name.startsWith("main.") || name.startsWith("app.") ||
            name === "route.ts" || name === "route.js"
        ) {
            tier1.push(blob);
        } else if (codeExts.has(ext)) {
            tier2.push(blob);
        } else if (ext === "md" || ext === "json" || ext === "yaml" || ext === "yml" || ext === "css" || ext === "scss") {
            tier3.push(blob);
        }
    }

    const byScoreDesc = (a: TreeItem, b: TreeItem) => scorePathForArchitecture(b.path) - scorePathForArchitecture(a.path);
    tier1.sort(byScoreDesc);
    tier2.sort(byScoreDesc);
    tier3.sort(byScoreDesc);

    // Take from each tier to fill up to maxFiles
    const result: TreeItem[] = [];
    const budget1 = Math.min(tier1.length, Math.ceil(maxFiles * 0.35));
    const budget2 = Math.min(tier2.length, maxFiles - budget1);
    const budget3 = Math.min(tier3.length, maxFiles - budget1 - budget2);

    result.push(...tier1.slice(0, budget1));
    result.push(...tier2.slice(0, budget2));
    result.push(...tier3.slice(0, budget3));

    return result.slice(0, maxFiles).sort(byScoreDesc);
}

/* ------------------------------------------------------------------ */
/*  Universal edge inference                                           */
/* ------------------------------------------------------------------ */

interface MermaidEdge {
    fromId: string;
    toId: string;
    label: string;
    dotted: boolean;
}

function inferEdges(files: ClassifiedFile[]): MermaidEdge[] {
    const edges: MermaidEdge[] = [];
    const seen = new Set<string>();

    function addEdge(from: string, to: string, label: string, dotted = false) {
        const key = `${from}→${to}`;
        if (seen.has(key) || from === to) return;
        seen.add(key);
        edges.push({ fromId: from, toId: to, label, dotted });
    }

    // Group by directory
    const byDir = new Map<string, ClassifiedFile[]>();
    files.forEach(f => {
        if (!byDir.has(f.dir)) byDir.set(f.dir, []);
        byDir.get(f.dir)!.push(f);
    });

    // 1. Index/barrel files export siblings
    byDir.forEach(dirFiles => {
        const barrel = dirFiles.find(f => f.baseName === "index" || f.baseName === "main");
        if (barrel && dirFiles.length > 1) {
            dirFiles.filter(f => f !== barrel).slice(0, 8).forEach(f => {
                addEdge(safeId(barrel.path), safeId(f.path), "provides");
            });
        }
    });

    // 2. Layout wraps pages (Next.js / similar)
    const layouts = files.filter(f => f.baseName === "layout" || f.baseName === "Layout");
    const pages = files.filter(f => f.baseName === "page" || f.baseName === "Home" || f.layer === "app");
    layouts.forEach(l => {
        pages.filter(p => p !== l).slice(0, 5).forEach(p => {
            addEdge(safeId(l.path), safeId(p.path), "contains");
        });
    });

    // 3. Pages/routes → UI components (prefer nearby files by path overlap)
    const appFiles = files.filter(f => f.layer === "app");
    const uiFiles = files.filter(f => f.layer === "ui" && f.baseName !== "index");
    if (appFiles.length > 0 && uiFiles.length > 0) {
        appFiles.slice(0, 8).forEach(p => {
            const routeSegment = p.dir.split("/").pop() || "";
            const preferred = uiFiles
                .filter((c) => routeSegment && c.path.toLowerCase().includes(routeSegment.toLowerCase()))
                .slice(0, 2);
            const fallback = uiFiles.slice(0, preferred.length > 0 ? 1 : 3);
            [...preferred, ...fallback].slice(0, 3).forEach(c => {
                addEdge(safeId(p.path), safeId(c.path), "renders");
            });
        });
    }

    // 4. UI components → logic (hooks, utils, core)
    const logicFiles = files.filter(f => f.layer === "logic" && f.baseName !== "index");
    if (uiFiles.length > 0 && logicFiles.length > 0) {
        uiFiles.slice(0, 10).forEach(u => {
            const preferred = logicFiles
                .filter((l) => l.baseName.toLowerCase().includes(u.baseName.toLowerCase()) || u.baseName.toLowerCase().includes(l.baseName.toLowerCase()))
                .slice(0, 2);
            const fallback = logicFiles.slice(0, preferred.length > 0 ? 1 : 3);
            [...preferred, ...fallback].slice(0, 3).forEach(l => {
                addEdge(safeId(u.path), safeId(l.path), "uses");
            });
        });
    }

    // 5. App → logic
    if (appFiles.length > 0 && logicFiles.length > 0) {
        appFiles.slice(0, 6).forEach(a => {
            const preferred = logicFiles.filter((l) => l.path.includes("/api/") || l.baseName === "route" || l.baseName.includes("service")).slice(0, 2);
            const fallback = logicFiles.slice(0, preferred.length > 0 ? 1 : 2);
            [...preferred, ...fallback].slice(0, 2).forEach(l => {
                addEdge(safeId(a.path), safeId(l.path), "calls");
            });
        });
    }

    // 6. Logic internal — type/interface files feed others 
    const typeFiles = logicFiles.filter(f => f.baseName.includes("type") || f.baseName.includes("interface"));
    const nonTypeLogic = logicFiles.filter(f => !f.baseName.includes("type") && !f.baseName.includes("interface"));
    if (typeFiles.length > 0 && nonTypeLogic.length > 0) {
        nonTypeLogic.slice(0, 8).forEach(c => {
            typeFiles.slice(0, 3).forEach(t => {
                addEdge(safeId(t.path), safeId(c.path), "defines types for");
            });
        });
    }

    // 7. Test → tested files (by name matching)
    const testFiles = files.filter(f => f.layer === "test");
    testFiles.forEach(t => {
        const cleanName = t.baseName
            .replace(/\.(test|spec)$/, "")
            .replace(/^test[_-]?/i, "")
            .replace(/[_-]?test$/i, "");
        if (!cleanName) return;

        const target = files.find(f =>
            f.layer !== "test" &&
            f.baseName.toLowerCase() === cleanName.toLowerCase()
        );
        if (target) {
            addEdge(safeId(t.path), safeId(target.path), "verifies");
        }
    });

    // 8. API route/service nodes connect to core utilities
    const apiLike = logicFiles.filter((f) => f.path.includes("/api/") || f.baseName === "route" || f.baseName.includes("service"));
    const utilityLike = logicFiles.filter((f) => f.path.includes("/lib/") || f.path.includes("/utils/") || f.baseName.includes("util"));
    apiLike.slice(0, 8).forEach((apiNode) => {
        utilityLike.slice(0, 2).forEach((utilNode) => {
            addEdge(safeId(apiNode.path), safeId(utilNode.path), "orchestrates", true);
        });
    });

    // Cap total edges to keep diagram readable and renderer-safe.
    return edges.slice(0, 90);
}

/* ------------------------------------------------------------------ */
/*  Main Mermaid generator                                             */
/* ------------------------------------------------------------------ */

export function generateMermaidFromTree(
    tree: TreeItem[],
    owner: string,
    repo: string
): string {
    // Select the most important files
    const selectedTrees = selectImportantFiles(tree, computeAdaptiveMaxFiles(tree));

    // Classify files
    const files: ClassifiedFile[] = selectedTrees.map(t => {
        const name = t.path.split("/").pop() || "";
        const { layer, roleLabel } = classifyFile(t.path);
        const meta = LAYER_META[layer];
        return {
            path: t.path,
            name,
            baseName: name.replace(/\.\w+$/, ""),
            ext: name.split(".").pop() || "",
            dir: t.path.split("/").slice(0, -1).join("/") || "",
            layer,
            mermaidClass: meta.mermaidClass,
            label: roleLabel,
        };
    });

    // Group by layer
    const groups = new Map<ArchLayer, ClassifiedFile[]>();
    files.forEach(f => {
        if (!groups.has(f.layer)) groups.set(f.layer, []);
        groups.get(f.layer)!.push(f);
    });

    const lines: string[] = [];
    lines.push("flowchart TB");

    // Render subgraphs in a logical order
    const layerOrder: ArchLayer[] = ["config", "app", "ui", "logic", "test", "docs", "other"];

    for (const layer of layerOrder) {
        const layerFiles = groups.get(layer);
        if (!layerFiles || layerFiles.length === 0) continue;

        const meta = LAYER_META[layer];
        lines.push("");
        lines.push(`  subgraph "${meta.subgraphLabel}"`);
        lines.push(`    direction TB`);

        layerFiles.forEach(f => {
            const id = safeId(f.path);
            const label = safeLabel(f.label);
            lines.push(`    ${id}["${label}"]:::${f.mermaidClass}`);
        });

        lines.push(`  end`);
    }

    // External nodes
    lines.push("");
    lines.push(`  User["User"]:::external`);
    lines.push(`  GitHubAPI["GitHub API"]:::external`);

    // Connect user to first app/page
    const firstApp = files.find(f => f.layer === "app" && (f.baseName === "page" || f.baseName === "Home"));
    if (firstApp) {
        lines.push(`  User -->|"visits"| ${safeId(firstApp.path)}`);
    }

    const apiTarget = files.find((f) => f.path.includes("/api/") || f.baseName === "route" || f.baseName.includes("service"));
    if (apiTarget) {
        lines.push(`  ${safeId(apiTarget.path)} -->|"fetches"| GitHubAPI`);
    }

    // Infer and render edges
    const edges = inferEdges(files);
    if (edges.length > 0) {
        lines.push("");
        edges.slice(0, 40).forEach(e => {
            const arrow = e.dotted ? "-.->" : "-->";
            const label = safeLabel(e.label);
            lines.push(`  ${e.fromId} ${arrow}|"${label}"| ${e.toId}`);
        });
    }

    // Click events → GitHub links
    lines.push("");
    files.forEach(f => {
        const id = safeId(f.path);
        const url = `https://github.com/${owner}/${repo}/blob/main/${f.path}`;
        lines.push(`  click ${id} "${url}"`);
    });

    // ClassDef styles — must be at the end
    lines.push("");
    lines.push(`  classDef external fill:#0b1220,stroke:#94a3b8,color:#e2e8f0,stroke-width:1px`);
    lines.push(`  classDef ui fill:#0b3a6a,stroke:#93c5fd,color:#eff6ff,stroke-width:1px`);
    lines.push(`  classDef hooks fill:#3b1d5a,stroke:#d8b4fe,color:#f5f3ff,stroke-width:1px`);
    lines.push(`  classDef core fill:#14532d,stroke:#86efac,color:#ecfdf5,stroke-width:1px`);
    lines.push(`  classDef ai fill:#7c2d12,stroke:#fdba74,color:#fff7ed,stroke-width:1px`);
    lines.push(`  classDef platform fill:#334155,stroke:#cbd5e1,color:#f1f5f9,stroke-width:1px`);
    lines.push(`  classDef test fill:#3f3f46,stroke:#a1a1aa,color:#fafafa,stroke-width:1px`);
    lines.push(`  classDef doc fill:#1f2937,stroke:#fbbf24,color:#fffbeb,stroke-width:1px`);
    lines.push(`  classDef note fill:#0f172a,stroke:#22c55e,color:#ecfccb,stroke-width:1px`);

    return lines.join("\n");
}

/**
 * Pick the best Mermaid code: AI-generated if available, else fallback from tree.
 */
export function generateArchitectureMermaid(
    analysis: ArchitectureAnalysis | null,
    tree: TreeItem[],
    owner: string,
    repo: string
): string {
    // If AI already produced Mermaid code, use it directly
    if (analysis?.mermaidDiagram) {
        return analysis.mermaidDiagram;
    }
    // Otherwise generate from tree
    return generateMermaidFromTree(tree, owner, repo);
}
