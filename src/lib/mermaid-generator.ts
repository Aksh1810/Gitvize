// ============================================================================
// GitViz — Mermaid.js Diagram Generator
// ============================================================================
// Generates valid Mermaid.js flowchart code from analysis results.
// Inspired by GitDiagram's 3-step pipeline:
//   1. Architectural Discovery → understand the system
//   2. Component Mapping → map to files/dirs
//   3. Mermaid Synthesis → generate diagram with click events

import type { ArchitectureAnalysis, ModuleAnalysis } from "@/types";

// --- Mermaid Shape Map ---
// Different shapes for different module types (GitDiagram convention)

const SHAPE_MAP: Record<string, (id: string, label: string) => string> = {
    api: (id, label) => `${id}("${label}")`,
    ui: (id, label) => `${id}("🖥️ ${label}")`,
    database: (id, label) => `${id}[("${label}")]`,       // keep cylinder
    config: (id, label) => `${id}("⚙️ ${label}")`,
    utility: (id, label) => `${id}("🔧 ${label}")`,
    test: (id, label) => `${id}("✅ ${label}")`,
    build: (id, label) => `${id}("📦 ${label}")`,
    docs: (id, label) => `${id}("📄 ${label}")`,
    core: (id, label) => `${id}("${label}")`,
    middleware: (id, label) => `${id}("${label}")`,
    service: (id, label) => `${id}("${label}")`,
    model: (id, label) => `${id}("${label}")`,
    controller: (id, label) => `${id}("${label}")`,
    view: (id, label) => `${id}("👁️ ${label}")`,
    other: (id, label) => `${id}("${label}")`,
};

// --- Module Type Colors (Mermaid CSS classes) ---

const MODULE_STYLE_MAP: Record<string, string> = {
    api: "fill:#0ea5e9,stroke:#0369a1,stroke-width:2px,color:#fff",
    ui: "fill:#16a34a,stroke:#14532d,stroke-width:2px,color:#fff",
    database: "fill:#22c55e,stroke:#14532d,stroke-width:2px,color:#062310",
    config: "fill:#f59e0b,stroke:#a16207,stroke-width:2px,color:#fff",
    utility: "fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff",
    test: "fill:#94a3b8,stroke:#475569,stroke-width:2px,stroke-dasharray:5 5,color:#fff",
    build: "fill:#f97316,stroke:#c2410c,stroke-width:2px,color:#fff",
    docs: "fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px,color:#0f172a",
    core: "fill:#7c3aed,stroke:#4c1d95,stroke-width:2px,color:#fff",
    middleware: "fill:#db2777,stroke:#9d174d,stroke-width:2px,color:#fff",
    service: "fill:#1d4ed8,stroke:#1e3a8a,stroke-width:2px,color:#fff",
    model: "fill:#22c55e,stroke:#15803d,stroke-width:2px,color:#fff",
    controller: "fill:#0ea5e9,stroke:#0369a1,stroke-width:2px,color:#fff",
    view: "fill:#16a34a,stroke:#14532d,stroke-width:2px,color:#fff",
    other: "fill:#cbd5e1,stroke:#64748b,stroke-width:2px,color:#0f172a",
};

// --- Sanitize node ID ---

function sanitizeId(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_")
        .toLowerCase();
}

// --- Generate Mermaid diagram code ---

export function generateMermaidDiagram(
    analysis: ArchitectureAnalysis,
    repoOwner: string,
    repoName: string
): string {
    const lines: string[] = [];
    const nodeIds = new Map<string, string>();

    // Header
    lines.push("flowchart TB");
    lines.push("");

    // Group modules into subgraphs by type
    const typeGroups = new Map<string, ModuleAnalysis[]>();
    analysis.modules.forEach(mod => {
        const group = getTypeGroup(mod.type);
        if (!typeGroups.has(group)) {
            typeGroups.set(group, []);
        }
        typeGroups.get(group)!.push(mod);
    });

    // Render subgraphs
    typeGroups.forEach((modules, groupName) => {
        const groupId = sanitizeId(groupName);
        lines.push(`    subgraph ${groupId}["${groupName}"]`);
        lines.push(`        direction TB`);

        modules.forEach(mod => {
            const nodeId = sanitizeId(mod.name);
            nodeIds.set(mod.name, nodeId);

            const shapeFunc = SHAPE_MAP[mod.type] || SHAPE_MAP.other;
            lines.push(`        ${shapeFunc(nodeId, mod.name)}`);
        });

        lines.push("    end");
        lines.push("");
    });

    // Render data flow edges
    if (analysis.dataFlow && analysis.dataFlow.length > 0) {
        lines.push("    %% Data Flow");
        analysis.dataFlow.forEach(flow => {
            const sourceId = findNodeId(flow.from, nodeIds, analysis.modules);
            const targetId = findNodeId(flow.to, nodeIds, analysis.modules);
            if (sourceId && targetId) {
                const label = flow.description
                    ? `-- "${truncate(flow.description, 30)}" -->`
                    : "-->";
                lines.push(`    ${sourceId} ${label} ${targetId}`);
            }
        });
        lines.push("");
    }

    // Render dependency edges
    lines.push("    %% Module Dependencies");
    analysis.modules.forEach(mod => {
        const sourceId = nodeIds.get(mod.name);
        if (!sourceId) return;

        mod.dependencies.forEach(dep => {
            const targetId = nodeIds.get(dep);
            if (targetId && sourceId !== targetId) {
                lines.push(`    ${sourceId} -.-> ${targetId}`);
            }
        });
    });
    lines.push("");

    // Click events — link to GitHub (GitDiagram's key feature)
    lines.push("    %% Click to Navigate to GitHub");
    analysis.modules.forEach(mod => {
        const nodeId = nodeIds.get(mod.name);
        if (!nodeId) return;

        // Find the best file/directory path for this module
        const clickPath = mod.entryPoint || mod.files[0] || "";
        if (clickPath) {
            // Use relative path — frontend prepends repo base URL
            lines.push(`    click ${nodeId} "https://github.com/${repoOwner}/${repoName}/tree/main/${clickPath}" _blank`);
        }
    });
    lines.push("");

    // Styling
    lines.push("    %% Styles");
    analysis.modules.forEach(mod => {
        const nodeId = nodeIds.get(mod.name);
        if (!nodeId) return;
        const style = MODULE_STYLE_MAP[mod.type] || MODULE_STYLE_MAP.other;
        lines.push(`    style ${nodeId} ${style}`);
    });

    // Subgraph styling
    typeGroups.forEach((_, groupName) => {
        const groupId = sanitizeId(groupName);
        lines.push(`    style ${groupId} fill:#2e1065,stroke:#6d28d9,stroke-width:2px,color:#d8b4fe,stroke-dasharray:4 4,rx:10,ry:10`);
    });

    return lines.join("\n");
}

// --- Generate simplified Mermaid for small repos (no analysis) ---

export function generateSimpleMermaid(
    tree: { path: string; type: string }[],
    repoOwner: string,
    repoName: string
): string {
    const lines: string[] = [];
    lines.push("flowchart TB");
    lines.push("");

    // Root node
    const rootId = sanitizeId(`${repoOwner}_${repoName}`);
    lines.push(`    ${rootId}("${repoOwner}/${repoName}")`);
    lines.push(`    style ${rootId} fill:#7c3aed,stroke:#4c1d95,stroke-width:2px,color:#fff`);
    lines.push("");

    // Group files by top-level directory
    const dirGroups = new Map<string, string[]>();
    tree
        .filter(item => item.type === "blob")
        .forEach(item => {
            const parts = item.path.split("/");
            const topDir = parts.length > 1 ? parts[0] : "__root__";
            if (!dirGroups.has(topDir)) {
                dirGroups.set(topDir, []);
            }
            dirGroups.get(topDir)!.push(item.path);
        });

    // Render dir groups as subgraphs
    let colorIdx = 0;
    const colors = ["#0ea5e9", "#16a34a", "#f97316", "#db2777", "#22c55e", "#1d4ed8", "#f59e0b"];

    dirGroups.forEach((files, dirName) => {
        if (dirName === "__root__") {
            // Root-level files — connect directly
            files.forEach(file => {
                const fileId = sanitizeId(file);
                const fileName = file.split("/").pop() || file;
                lines.push(`    ${fileId}("${fileName}")`);
                lines.push(`    ${rootId} --> ${fileId}`);
            });
        } else {
            const dirId = sanitizeId(dirName);
            const color = colors[colorIdx % colors.length];
            lines.push(`    subgraph ${dirId}["📁 ${dirName} (${files.length} files)"]`);

            // Show all files
            files.forEach(file => {
                const fileId = sanitizeId(file);
                const fileName = file.split("/").pop() || file;
                lines.push(`        ${fileId}("${fileName}")`);
                lines.push(
                    `        click ${fileId} "https://github.com/${repoOwner}/${repoName}/blob/main/${file}" _blank`
                );
            });

            lines.push("    end");
            lines.push(`    ${rootId} --> ${dirId}`);
            lines.push(`    style ${dirId} fill:transparent,stroke:${color},stroke-width:2px,color:${color},stroke-dasharray:4 4,rx:10,ry:10`);
            colorIdx++;
        }
    });

    return lines.join("\n");
}

// --- Helpers ---

function getTypeGroup(type: ModuleAnalysis["type"]): string {
    const groups: Record<string, string> = {
        api: "🌐 API & Services",
        service: "🌐 API & Services",
        controller: "🌐 API & Services",
        ui: "🖥️ Frontend & UI",
        view: "🖥️ Frontend & UI",
        database: "💾 Data Layer",
        model: "💾 Data Layer",
        core: "⚙️ Core Logic",
        middleware: "⚙️ Core Logic",
        utility: "🔧 Utilities & Tools",
        config: "🔧 Utilities & Tools",
        build: "🔧 Utilities & Tools",
        test: "✅ Testing",
        docs: "📄 Documentation",
        other: "📦 Other",
    };
    return groups[type] || groups.other;
}

function findNodeId(
    name: string,
    nodeIds: Map<string, string>,
    modules: ModuleAnalysis[]
): string | null {
    // Direct match
    if (nodeIds.has(name)) return nodeIds.get(name)!;

    // Fuzzy match
    const match = modules.find(
        m =>
            m.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(m.name.toLowerCase())
    );
    if (match) return nodeIds.get(match.name) || null;

    return null;
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + "...";
}
