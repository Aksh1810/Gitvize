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
    api: (id, label) => `${id}[/"${label}" API/]`,
    ui: (id, label) => `${id}["🖥️ ${label}"]`,
    database: (id, label) => `${id}[("${label}")]`,       // cylinder
    config: (id, label) => `${id}{{"${label}"}}`,          // hexagon
    utility: (id, label) => `${id}["🔧 ${label}"]`,
    test: (id, label) => `${id}["✅ ${label}"]`,
    build: (id, label) => `${id}(["${label}"])`,           // stadium
    docs: (id, label) => `${id}>"${label}"]`,              // asymmetric
    core: (id, label) => `${id}[["${label}"]]`,            // subroutine
    middleware: (id, label) => `${id}[/"${label}"/]`,      // parallelogram
    service: (id, label) => `${id}(("${label}"))`,         // circle
    model: (id, label) => `${id}[("${label}")]`,           // cylinder
    controller: (id, label) => `${id}[/"${label}" Controller/]`,
    view: (id, label) => `${id}["👁️ ${label}"]`,
    other: (id, label) => `${id}["${label}"]`,
};

// --- Module Type Colors (Mermaid CSS classes) ---

const MODULE_STYLE_MAP: Record<string, string> = {
    api: "fill:#3b82f6,stroke:#2563eb,color:#fff",
    ui: "fill:#a855f7,stroke:#9333ea,color:#fff",
    database: "fill:#06b6d4,stroke:#0891b2,color:#fff",
    config: "fill:#eab308,stroke:#ca8a04,color:#000",
    utility: "fill:#6b7280,stroke:#4b5563,color:#fff",
    test: "fill:#22c55e,stroke:#16a34a,color:#fff",
    build: "fill:#f97316,stroke:#ea580c,color:#fff",
    docs: "fill:#14b8a6,stroke:#0d9488,color:#fff",
    core: "fill:#7c3aed,stroke:#6d28d9,color:#fff",
    middleware: "fill:#ec4899,stroke:#db2777,color:#fff",
    service: "fill:#8b5cf6,stroke:#7c3aed,color:#fff",
    model: "fill:#06b6d4,stroke:#0891b2,color:#fff",
    controller: "fill:#3b82f6,stroke:#2563eb,color:#fff",
    view: "fill:#a855f7,stroke:#9333ea,color:#fff",
    other: "fill:#374151,stroke:#1f2937,color:#e5e7eb",
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
        lines.push(`    style ${groupId} fill:transparent,stroke:#374151,stroke-width:2px,color:#9ca3af,stroke-dasharray:5`);
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
    lines.push(`    ${rootId}[["${repoOwner}/${repoName}"]]`);
    lines.push(`    style ${rootId} fill:#7c3aed,stroke:#6d28d9,color:#fff`);
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
    const colors = ["#3b82f6", "#a855f7", "#06b6d4", "#f97316", "#22c55e", "#ec4899", "#eab308"];

    dirGroups.forEach((files, dirName) => {
        if (dirName === "__root__") {
            // Root-level files — connect directly
            files.slice(0, 5).forEach(file => {
                const fileId = sanitizeId(file);
                const fileName = file.split("/").pop() || file;
                lines.push(`    ${fileId}["${fileName}"]`);
                lines.push(`    ${rootId} --> ${fileId}`);
            });
            if (files.length > 5) {
                const moreId = sanitizeId("root_more");
                lines.push(`    ${moreId}["... +${files.length - 5} more"]`);
                lines.push(`    ${rootId} --> ${moreId}`);
            }
        } else {
            const dirId = sanitizeId(dirName);
            const color = colors[colorIdx % colors.length];
            lines.push(`    subgraph ${dirId}["📁 ${dirName} (${files.length} files)"]`);

            // Show up to 6 key files
            const keyFiles = files.slice(0, 6);
            keyFiles.forEach(file => {
                const fileId = sanitizeId(file);
                const fileName = file.split("/").pop() || file;
                lines.push(`        ${fileId}["${fileName}"]`);
                lines.push(
                    `        click ${fileId} "https://github.com/${repoOwner}/${repoName}/blob/main/${file}" _blank`
                );
            });
            if (files.length > 6) {
                const moreId = sanitizeId(`${dirName}_more`);
                lines.push(`        ${moreId}["... +${files.length - 6} more"]`);
            }

            lines.push("    end");
            lines.push(`    ${rootId} --> ${dirId}`);
            lines.push(`    style ${dirId} fill:transparent,stroke:${color},stroke-width:2px,color:${color}`);
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
