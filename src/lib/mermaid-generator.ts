// ============================================================================
// GitViz — GitDiagram-style Mermaid Code Generator
// ============================================================================
// Generates detailed Mermaid flowchart code from file tree data,
// replicating the visual quality and structure of GitDiagram.

import { TreeItem, ArchitectureAnalysis } from "@/types";

/* ------------------------------------------------------------------ */
/*  File classification helpers                                        */
/* ------------------------------------------------------------------ */

interface FileInfo {
    path: string;
    name: string;
    baseName: string;
    ext: string;
    dir: string;
    category: string;
    label: string;
    classType: string;
}

function categorizeFile(path: string): { category: string; classType: string; label: string } {
    const name = path.split("/").pop() || "";
    const baseName = name.replace(/\.\w+$/, "");
    const lower = path.toLowerCase();
    const ext = name.split(".").pop() || "";

    // Tests
    if (lower.includes("test") || lower.includes("spec") || lower.includes("__tests__")) {
        return { category: "test", classType: "test", label: `${baseName}` };
    }

    // Config / tooling at root
    if (!path.includes("/")) {
        if (name.includes("config") || name.includes("rc") || name === "package.json" || name.includes("tsconfig"))
            return { category: "config", classType: "platform", label: `${name}` };
        if (name.includes("eslint") || name.includes("prettier"))
            return { category: "config", classType: "platform", label: `${name} (lint)` };
        if (name.includes("tailwind") || name.includes("postcss"))
            return { category: "config", classType: "platform", label: `${name} (styling pipeline)` };
        if (name === ".gitignore" || name === ".env" || name === ".env.local")
            return { category: "config", classType: "platform", label: name };
        if (name === "README.md" || name === "LICENSE")
            return { category: "docs", classType: "doc", label: name };
        return { category: "config", classType: "platform", label: name };
    }

    // Hooks
    if (lower.includes("hook") || (lower.includes("/hooks/") && ext === "ts")) {
        return { category: "hooks", classType: "hooks", label: `${baseName} (hook)` };
    }

    // Core / engine / domain logic
    if (lower.includes("/core/") || lower.includes("/engine/") || lower.includes("/domain/")) {
        if (lower.includes("type")) return { category: "core", classType: "core", label: `${baseName} (types/constants)` };
        if (lower.includes("rule")) return { category: "core", classType: "core", label: `${baseName} (validation)` };
        if (lower.includes("engine")) return { category: "core", classType: "core", label: `${baseName} (state transitions)` };
        if (lower.includes("chain") || lower.includes("reaction")) return { category: "core", classType: "core", label: `${baseName} (chain processing)` };
        if (lower.includes("ai") || lower.includes("minimax")) return { category: "core", classType: "ai", label: `${baseName} (AI logic)` };
        if (lower.includes("grid")) return { category: "core", classType: "core", label: `${baseName} (grid/neighbors)` };
        if (lower.includes("index")) return { category: "core", classType: "core", label: `${baseName} (barrel)` };
        return { category: "core", classType: "core", label: baseName };
    }

    // API routes
    if (lower.includes("/api/") || lower.includes("/route")) {
        return { category: "api", classType: "hooks", label: `${baseName} (API)` };
    }

    // Pages / App routes
    if (lower.includes("/app/") || lower.includes("/pages/")) {
        if (name === "layout.tsx" || name === "layout.ts") return { category: "app", classType: "ui", label: "Layout (shell)" };
        if (name === "page.tsx" || name === "page.ts") {
            const dir = path.split("/").slice(-2, -1)[0] || "";
            if (dir === "app") return { category: "app", classType: "ui", label: "Home Page '/'" };
            return { category: "app", classType: "ui", label: `${dir} Page '/${dir}'` };
        }
        if (name.includes("globals") || name.endsWith(".css")) return { category: "app", classType: "platform", label: `${name}` };
        return { category: "app", classType: "ui", label: baseName };
    }

    // Components
    if (lower.includes("component") || (ext === "tsx" && !lower.includes("app/"))) {
        if (lower.includes("index")) return { category: "components", classType: "ui", label: `${baseName} (barrel)` };
        return { category: "components", classType: "ui", label: baseName };
    }

    // Lib / utilities
    if (lower.includes("/lib/") || lower.includes("/utils/") || lower.includes("/helpers/")) {
        return { category: "utility", classType: "core", label: `${baseName} (utility)` };
    }

    // Styles
    if (ext === "css" || ext === "scss" || ext === "sass") {
        return { category: "styles", classType: "platform", label: baseName };
    }

    // Types
    if (lower.includes("/types/") || lower.includes("types.ts") || lower.includes("types.d.ts")) {
        return { category: "types", classType: "core", label: `${baseName} (types)` };
    }

    // Docs
    if (ext === "md" || lower.includes("/docs/")) {
        return { category: "docs", classType: "doc", label: baseName };
    }

    // Public / assets
    if (lower.includes("/public/") || lower.includes("/assets/")) {
        return { category: "public", classType: "platform", label: baseName };
    }

    // Default
    return { category: "other", classType: "ui", label: baseName };
}

function sanitizeId(path: string): string {
    return path.replace(/[^a-zA-Z0-9]/g, "_").replace(/__+/g, "_");
}

/* ------------------------------------------------------------------ */
/*  Relationship inference                                             */
/* ------------------------------------------------------------------ */

interface Edge {
    from: string;
    to: string;
    label: string;
    style: "solid" | "dotted";
}

function inferEdges(files: FileInfo[], owner: string, repo: string): Edge[] {
    const edges: Edge[] = [];
    const fileMap = new Map<string, FileInfo>();
    files.forEach(f => fileMap.set(f.path, f));

    const byDir = new Map<string, FileInfo[]>();
    files.forEach(f => {
        const dir = f.dir || "root";
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir)!.push(f);
    });

    // Layout wraps pages
    const layouts = files.filter(f => f.name.startsWith("layout."));
    const pages = files.filter(f => f.name.startsWith("page.") && f.category === "app");
    layouts.forEach(l => {
        pages.forEach(p => {
            edges.push({ from: sanitizeId(l.path), to: sanitizeId(p.path), label: "wraps", style: "solid" });
        });
    });

    // Layout imports globals.css
    const globalsCss = files.find(f => f.name.includes("globals") && (f.ext === "css" || f.ext === "scss"));
    if (layouts.length > 0 && globalsCss) {
        edges.push({ from: sanitizeId(layouts[0].path), to: sanitizeId(globalsCss.path), label: "imports", style: "solid" });
    }

    // Index/barrel files export siblings
    byDir.forEach(dirFiles => {
        const barrel = dirFiles.find(f => f.name.startsWith("index."));
        if (barrel && dirFiles.length > 1) {
            dirFiles.filter(f => f !== barrel).forEach(f => {
                edges.push({ from: sanitizeId(barrel.path), to: sanitizeId(f.path), label: "exports", style: "solid" });
            });
        }
    });

    // Pages → components (composes_screen)
    const componentFiles = files.filter(f => f.category === "components" && !f.name.startsWith("index."));
    pages.forEach(p => {
        // Find the most likely main component
        const mainComp = componentFiles.find(c =>
            c.baseName.toLowerCase().includes("board") ||
            c.baseName.toLowerCase().includes("main") ||
            c.baseName.toLowerCase().includes("app")
        );
        if (mainComp) {
            const dirName = p.path.split("/").slice(-2, -1)[0] || "";
            const mode = dirName === "app" ? "" : `(mode=${dirName})`;
            edges.push({ from: sanitizeId(p.path), to: sanitizeId(mainComp.path), label: `composes_screen${mode}`, style: "solid" });
        }
    });

    // Component hierarchy: find composing relationships
    const componentList = componentFiles.filter(f => f.ext === "tsx" || f.ext === "jsx");
    componentList.forEach(comp => {
        const nameL = comp.baseName.toLowerCase();
        componentList.forEach(other => {
            if (comp === other) return;
            const otherNameL = other.baseName.toLowerCase();
            // Common patterns
            if (nameL.includes("board") && (otherNameL.includes("cell") || otherNameL.includes("tile")))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "composes", style: "solid" });
            if (nameL.includes("cell") && otherNameL.includes("dot"))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "renders", style: "solid" });
            if (nameL.includes("board") && (otherNameL.includes("bar") || otherNameL.includes("score") || otherNameL.includes("hud")))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "shows", style: "solid" });
            if (nameL.includes("board") && otherNameL.includes("modal"))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "shows", style: "solid" });
            if (nameL.includes("board") && otherNameL.includes("nav"))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "uses", style: "solid" });
            if (nameL.includes("cell") && (otherNameL.includes("burst") || otherNameL.includes("effect") || otherNameL.includes("explosion") || otherNameL.includes("ring")))
                edges.push({ from: sanitizeId(comp.path), to: sanitizeId(other.path), label: "triggers_animation", style: "dotted" });
        });
    });

    // Components → Hooks
    const hookFiles = files.filter(f => f.category === "hooks" && !f.name.startsWith("index."));
    const mainBoard = componentFiles.find(c => c.baseName.toLowerCase().includes("board") || c.baseName.toLowerCase().includes("main"));
    hookFiles.forEach(h => {
        if (mainBoard) {
            edges.push({ from: sanitizeId(mainBoard.path), to: sanitizeId(h.path), label: `${h.baseName}()`, style: "solid" });
        }
    });

    // Hooks → Core
    const coreFiles = files.filter(f => f.category === "core" && !f.name.startsWith("index."));
    const mainHook = hookFiles.find(h => h.baseName.toLowerCase().includes("game") || h.baseName.toLowerCase().includes("main") || h.baseName.toLowerCase().includes("state"));
    if (mainHook) {
        const engineFile = coreFiles.find(c => c.baseName.toLowerCase().includes("engine") || c.baseName.toLowerCase().includes("state"));
        if (engineFile) edges.push({ from: sanitizeId(mainHook.path), to: sanitizeId(engineFile.path), label: "applyMove(State,Move)", style: "solid" });

        const aiFile = coreFiles.find(c => c.baseName.toLowerCase().includes("ai") || c.baseName.toLowerCase().includes("minimax"));
        if (aiFile) edges.push({ from: sanitizeId(mainHook.path), to: sanitizeId(aiFile.path), label: "computeBestMove()", style: "solid" });

        // Hook → Audio hook
        const audioHook = hookFiles.find(h => h.baseName.toLowerCase().includes("audio") || h.baseName.toLowerCase().includes("sound"));
        if (audioHook) edges.push({ from: sanitizeId(mainHook.path), to: sanitizeId(audioHook.path), label: "play_sound", style: "dotted" });
    }

    // Core internal relationships
    const typesFile = coreFiles.find(c => c.baseName.toLowerCase().includes("type"));
    const rulesFile = coreFiles.find(c => c.baseName.toLowerCase().includes("rule"));
    const engineFile = coreFiles.find(c => c.baseName.toLowerCase().includes("engine"));
    const chainFile = coreFiles.find(c => c.baseName.toLowerCase().includes("chain") || c.baseName.toLowerCase().includes("reaction"));
    const gridFile = coreFiles.find(c => c.baseName.toLowerCase().includes("grid"));
    const aiFile = coreFiles.find(c => c.baseName.toLowerCase().includes("ai"));

    if (typesFile) {
        [rulesFile, engineFile, chainFile, gridFile, aiFile].filter(Boolean).forEach(f => {
            edges.push({ from: sanitizeId(typesFile.path), to: sanitizeId(f!.path), label: "shared_types", style: "solid" });
        });
    }
    if (engineFile && rulesFile) edges.push({ from: sanitizeId(engineFile.path), to: sanitizeId(rulesFile.path), label: "validateMove()", style: "solid" });
    if (engineFile && chainFile) edges.push({ from: sanitizeId(engineFile.path), to: sanitizeId(chainFile.path), label: "processExplosions()", style: "solid" });
    if (engineFile && rulesFile) edges.push({ from: sanitizeId(engineFile.path), to: sanitizeId(rulesFile.path), label: "checkWin()", style: "solid" });
    if (chainFile && gridFile) edges.push({ from: sanitizeId(chainFile.path), to: sanitizeId(gridFile.path), label: "neighbors/bounds", style: "solid" });
    if (aiFile && engineFile) edges.push({ from: sanitizeId(aiFile.path), to: sanitizeId(engineFile.path), label: "simulate_applyMove()", style: "solid" });
    if (aiFile && rulesFile) edges.push({ from: sanitizeId(aiFile.path), to: sanitizeId(rulesFile.path), label: "terminal/valid_moves", style: "solid" });

    // Test → tested files
    const testFiles = files.filter(f => f.category === "test");
    testFiles.forEach(t => {
        const testName = t.baseName.replace(/\.(test|spec)$/, "").replace(/^test_?/, "");
        const target = files.find(f => f.category !== "test" && f.baseName.toLowerCase() === testName.toLowerCase());
        if (target) {
            edges.push({ from: sanitizeId(t.path), to: sanitizeId(target.path), label: "asserts_contract", style: "solid" });
        }
    });

    // Animation components → Framer Motion
    const effectComps = componentFiles.filter(c =>
        c.baseName.toLowerCase().includes("burst") || c.baseName.toLowerCase().includes("ring") ||
        c.baseName.toLowerCase().includes("effect") || c.baseName.toLowerCase().includes("explosion") ||
        c.baseName.toLowerCase().includes("animation")
    );
    // These are represented by the external platform nodes we'll add

    // Globals → Tailwind (conceptual)

    // Deduplicate edges
    const seen = new Set<string>();
    return edges.filter(e => {
        const key = `${e.from}-${e.to}-${e.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export function generateMermaidFromTree(
    tree: TreeItem[],
    owner: string,
    repo: string
): string {
    const allFiles = tree.filter(t => t.type === "blob").slice(0, 120);

    // Classify all files
    const fileInfos: FileInfo[] = allFiles.map(t => {
        const name = t.path.split("/").pop() || "";
        const { category, classType, label } = categorizeFile(t.path);
        return {
            path: t.path,
            name,
            baseName: name.replace(/\.\w+$/, ""),
            ext: name.split(".").pop() || "",
            dir: t.path.split("/").slice(0, -1).join("/"),
            category,
            classType,
            label,
        };
    });

    // Group files by category
    const groups = new Map<string, FileInfo[]>();
    fileInfos.forEach(f => {
        if (!groups.has(f.category)) groups.set(f.category, []);
        groups.get(f.category)!.push(f);
    });

    const lines: string[] = [];
    lines.push("flowchart TD");

    // Subgraph labels
    const subgraphLabels: Record<string, string> = {
        app: "Next.js App Router (Pages)",
        components: "UI / View Components",
        hooks: "State / Orchestration (Hooks)",
        core: "Core Domain (Pure / Testable Engine)",
        test: "Tests",
        config: "Dev / Tooling / Deploy",
        utility: "Library / Utilities",
        api: "API Routes",
        types: "Type Definitions",
        styles: "Styles",
        docs: "Documentation",
        public: "Public / Assets",
        other: "Other",
    };

    // Render subgraphs
    const subgraphOrder = ["config", "app", "components", "hooks", "core", "api", "utility", "types", "styles", "test", "docs", "public", "other"];

    for (const cat of subgraphOrder) {
        const catFiles = groups.get(cat);
        if (!catFiles || catFiles.length === 0) continue;

        const label = subgraphLabels[cat] || cat;
        lines.push("");
        lines.push(`  subgraph "${label}"`);
        lines.push(`    direction TB`);

        catFiles.forEach(f => {
            const id = sanitizeId(f.path);
            const safeLabel = f.label.replace(/"/g, "'");
            lines.push(`    ${id}["${safeLabel}"]:::${f.classType}`);
        });

        lines.push(`  end`);
    }

    // External nodes (platform dependencies)
    const hasTailwind = allFiles.some(f => f.path.toLowerCase().includes("tailwind"));
    const hasFramer = allFiles.some(f => f.path.toLowerCase().includes("framer") || f.path.toLowerCase().includes("motion"));
    const hasNextConfig = allFiles.some(f => f.path.toLowerCase().includes("next.config"));

    lines.push("");
    lines.push("  %% External / Platform Nodes");
    if (hasNextConfig) lines.push(`  NextRuntime["Next.js Runtime"]:::platform`);
    if (hasTailwind) lines.push(`  TailwindEngine["Tailwind CSS"]:::platform`);
    if (hasFramer) lines.push(`  FramerEngine["Framer Motion"]:::platform`);

    // User node
    lines.push(`  User["User (click/tap)"]:::external`);

    // Edges
    const edges = inferEdges(fileInfos, owner, repo);
    lines.push("");
    lines.push("  %% Relationships");
    edges.forEach(e => {
        const arrow = e.style === "dotted" ? `-.->` : `-->`;
        const safeLabel = e.label.replace(/"/g, "'");
        lines.push(`  ${e.from} ${arrow}|"${safeLabel}"| ${e.to}`);
    });

    // User → main page
    const mainPage = fileInfos.find(f => f.category === "app" && f.name === "page.tsx" && f.dir === "src/app");
    if (mainPage) {
        lines.push(`  User -->|"click/tap"| ${sanitizeId(mainPage.path)}`);
    }

    // External platform edges
    const globalsCss = fileInfos.find(f => f.name.includes("globals") && (f.ext === "css" || f.ext === "scss"));
    if (hasTailwind && globalsCss) {
        lines.push(`  ${sanitizeId(globalsCss.path)} -->|"styles"| TailwindEngine`);
    }

    const effectComps = fileInfos.filter(f => f.category === "components" &&
        (f.baseName.toLowerCase().includes("burst") || f.baseName.toLowerCase().includes("ring") || f.baseName.toLowerCase().includes("effect"))
    );
    if (hasFramer) {
        effectComps.forEach(e => {
            lines.push(`  ${sanitizeId(e.path)} -.->|"motion_runtime"| FramerEngine`);
        });
    }

    // Click events (link to GitHub)
    lines.push("");
    lines.push("  %% Click Events (link to GitHub files)");
    fileInfos.forEach(f => {
        const id = sanitizeId(f.path);
        const url = `https://github.com/${owner}/${repo}/blob/main/${f.path}`;
        lines.push(`  click ${id} "${url}"`);
    });

    // Style classes
    lines.push("");
    lines.push("  %% Styles");
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
 * Generate Mermaid code from AI analysis (if mermaidDiagram already provided).
 * Falls back to tree-based generation.
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
