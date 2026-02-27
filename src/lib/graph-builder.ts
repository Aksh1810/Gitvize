// ============================================================================
// GitViz — Graph Builder (Graphology-compatible knowledge graph)
// ============================================================================
// Transforms file tree + dependency data into a graph structure.
// Inspired by GitNexus's deterministic AST-based knowledge graph approach,
// adapted to work with GitHub API data (no local filesystem access).

import type { TreeItem, ArchitectureAnalysis, ModuleAnalysis } from "@/types";

// --- Types ---

export interface GraphNode {
    id: string;
    label: string;
    type: "file" | "folder" | "module" | "root";
    path: string;
    extension?: string;
    size?: number;
    module?: string;
    moduleType?: ModuleAnalysis["type"];
    cluster?: number;
    x?: number;
    y?: number;
    color?: string;
    centrality?: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    type: "contains" | "imports" | "depends" | "dataflow";
    weight?: number;
    label?: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    clusters: ClusterInfo[];
    stats: GraphStats;
}

export interface ClusterInfo {
    id: number;
    label: string;
    color: string;
    fileCount: number;
    files: string[];
}

export interface GraphStats {
    totalFiles: number;
    totalFolders: number;
    totalEdges: number;
    totalClusters: number;
    mostConnectedFiles: Array<{ path: string; connections: number }>;
}

// --- Cluster Colors (purple-centric palette inspired by GitNexus) ---

const CLUSTER_COLORS = [
    "#7c3aed", // violet-600
    "#06b6d4", // cyan-500
    "#f97316", // orange-500
    "#10b981", // emerald-500
    "#ec4899", // pink-500
    "#eab308", // yellow-500
    "#8b5cf6", // violet-500
    "#3b82f6", // blue-500
    "#ef4444", // red-500
    "#14b8a6", // teal-500
    "#a855f7", // purple-500
    "#22c55e", // green-500
];

// --- Module Type Colors ---

const MODULE_TYPE_COLORS: Record<string, string> = {
    api: "#3b82f6",
    ui: "#a855f7",
    database: "#06b6d4",
    config: "#eab308",
    utility: "#6b7280",
    test: "#22c55e",
    build: "#f97316",
    docs: "#14b8a6",
    core: "#7c3aed",
    middleware: "#ec4899",
    service: "#8b5cf6",
    model: "#06b6d4",
    controller: "#3b82f6",
    view: "#a855f7",
    other: "#6b7280",
};

// --- Import Pattern Detection ---

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
    typescript: [
        /import\s+.*?\s+from\s+['"](.+?)['"]/g,
        /import\s+['"](.+?)['"]/g,
        /require\s*\(\s*['"](.+?)['"]\s*\)/g,
    ],
    python: [
        /from\s+(\S+)\s+import/g,
        /import\s+(\S+)/g,
    ],
    go: [
        /"(\S+)"/g, // within import blocks
    ],
    rust: [
        /use\s+(\S+)::/g,
        /mod\s+(\S+)/g,
    ],
};

// --- Helper: Get file extension ---

function getExtension(path: string): string {
    const parts = path.split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
}

// --- Helper: Get parent directory ---

function getParentDir(path: string): string {
    const parts = path.split("/");
    return parts.slice(0, -1).join("/") || "/";
}

// --- Helper: Get filename ---

function getFilename(path: string): string {
    return path.split("/").pop() || path;
}

// --- Simplified Community Detection ---
// Uses directory structure + naming patterns to cluster files
// (real Leiden algorithm needs the full graph; this is a practical heuristic)

function detectCommunities(
    tree: TreeItem[],
    analysis?: ArchitectureAnalysis
): Map<string, number> {
    const fileClusters = new Map<string, number>();

    if (analysis?.modules) {
        // Use AI-detected modules if available
        analysis.modules.forEach((mod, idx) => {
            mod.files.forEach(file => {
                fileClusters.set(file, idx);
            });
        });
    } else {
        // Heuristic: cluster by top-level directory
        const topDirs = new Map<string, number>();
        let clusterIdx = 0;

        tree
            .filter(item => item.type === "blob")
            .forEach(item => {
                const parts = item.path.split("/");
                const topDir = parts.length > 1 ? parts[0] : "__root__";

                if (!topDirs.has(topDir)) {
                    topDirs.set(topDir, clusterIdx++);
                }
                fileClusters.set(item.path, topDirs.get(topDir)!);
            });
    }

    return fileClusters;
}

// --- Main: Build Graph Data ---

export function buildGraphData(
    tree: TreeItem[],
    analysis?: ArchitectureAnalysis,
    repoOwner?: string,
    repoName?: string
): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();
    const connectionCount = new Map<string, number>();

    // Detect communities
    const communities = detectCommunities(tree, analysis);

    // Add root node
    const rootId = `root:${repoOwner}/${repoName}`;
    const rootNode: GraphNode = {
        id: rootId,
        label: `${repoOwner}/${repoName}`,
        type: "root",
        path: "/",
        color: "#7c3aed",
    };
    nodes.push(rootNode);
    nodeMap.set("/", rootNode);

    // Build folder nodes
    const folders = new Set<string>();
    tree.forEach(item => {
        const parts = item.path.split("/");
        for (let i = 1; i < parts.length; i++) {
            const folderPath = parts.slice(0, i).join("/");
            if (!folders.has(folderPath)) {
                folders.add(folderPath);
                const cluster = communities.get(folderPath);
                const node: GraphNode = {
                    id: `folder:${folderPath}`,
                    label: getFilename(folderPath),
                    type: "folder",
                    path: folderPath,
                    cluster,
                    color: cluster !== undefined
                        ? CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
                        : "#6b7280",
                };
                nodes.push(node);
                nodeMap.set(folderPath, node);

                // Edge: parent contains this folder
                const parent = getParentDir(folderPath);
                const parentNode = nodeMap.get(parent);
                if (parentNode) {
                    edges.push({
                        source: parentNode.id,
                        target: node.id,
                        type: "contains",
                    });
                } else {
                    edges.push({
                        source: rootId,
                        target: node.id,
                        type: "contains",
                    });
                }
            }
        }
    });

    // Build file nodes
    tree
        .filter(item => item.type === "blob")
        .forEach(item => {
            const ext = getExtension(item.path);
            const cluster = communities.get(item.path);
            const moduleForFile = analysis?.modules.find(m =>
                m.files.some(f => item.path.includes(f) || f.includes(item.path))
            );

            const node: GraphNode = {
                id: `file:${item.path}`,
                label: getFilename(item.path),
                type: "file",
                path: item.path,
                extension: ext,
                size: item.size,
                module: moduleForFile?.name,
                moduleType: moduleForFile?.type,
                cluster,
                color: moduleForFile
                    ? MODULE_TYPE_COLORS[moduleForFile.type] || "#6b7280"
                    : cluster !== undefined
                        ? CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
                        : "#6b7280",
            };
            nodes.push(node);
            nodeMap.set(item.path, node);

            // Edge: folder contains file
            const parent = getParentDir(item.path);
            const parentNode = nodeMap.get(parent);
            if (parentNode) {
                edges.push({
                    source: parentNode.id,
                    target: node.id,
                    type: "contains",
                });
            } else {
                edges.push({
                    source: rootId,
                    target: node.id,
                    type: "contains",
                });
            }
        });

    // Add module nodes from analysis
    if (analysis?.modules) {
        analysis.modules.forEach((mod, idx) => {
            const moduleNode: GraphNode = {
                id: `module:${mod.name}`,
                label: mod.name,
                type: "module",
                path: mod.name,
                moduleType: mod.type,
                cluster: idx,
                color: MODULE_TYPE_COLORS[mod.type] || "#7c3aed",
            };
            nodes.push(moduleNode);
            nodeMap.set(`module:${mod.name}`, moduleNode);
        });

        // Add dependency edges between modules
        analysis.modules.forEach(mod => {
            mod.dependencies.forEach(dep => {
                const targetModule = analysis.modules.find(m => m.name === dep);
                if (targetModule) {
                    edges.push({
                        source: `module:${mod.name}`,
                        target: `module:${targetModule.name}`,
                        type: "depends",
                        label: "depends on",
                    });
                    connectionCount.set(
                        `module:${mod.name}`,
                        (connectionCount.get(`module:${mod.name}`) || 0) + 1
                    );
                    connectionCount.set(
                        `module:${targetModule.name}`,
                        (connectionCount.get(`module:${targetModule.name}`) || 0) + 1
                    );
                }
            });
        });
    }

    // Add data flow edges
    if (analysis?.dataFlow) {
        analysis.dataFlow.forEach(flow => {
            const sourceNode = nodes.find(
                n => n.label === flow.from || n.path.includes(flow.from)
            );
            const targetNode = nodes.find(
                n => n.label === flow.to || n.path.includes(flow.to)
            );
            if (sourceNode && targetNode) {
                edges.push({
                    source: sourceNode.id,
                    target: targetNode.id,
                    type: "dataflow",
                    label: flow.description,
                });
            }
        });
    }

    // Calculate centrality
    nodes.forEach(node => {
        const incoming = edges.filter(e => e.target === node.id).length;
        const outgoing = edges.filter(e => e.source === node.id).length;
        node.centrality = incoming + outgoing;
    });

    // Build cluster info
    const clusterMap = new Map<number, string[]>();
    communities.forEach((clusterId, filePath) => {
        if (!clusterMap.has(clusterId)) {
            clusterMap.set(clusterId, []);
        }
        clusterMap.get(clusterId)!.push(filePath);
    });

    const clusters: ClusterInfo[] = [];
    clusterMap.forEach((files, id) => {
        const moduleForCluster = analysis?.modules[id];
        clusters.push({
            id,
            label: moduleForCluster?.name || `Cluster ${id + 1}`,
            color: CLUSTER_COLORS[id % CLUSTER_COLORS.length],
            fileCount: files.length,
            files,
        });
    });

    // Stats
    const mostConnected = nodes
        .filter(n => n.type === "file" || n.type === "module")
        .sort((a, b) => (b.centrality || 0) - (a.centrality || 0))
        .slice(0, 10)
        .map(n => ({ path: n.path, connections: n.centrality || 0 }));

    return {
        nodes,
        edges,
        clusters,
        stats: {
            totalFiles: nodes.filter(n => n.type === "file").length,
            totalFolders: nodes.filter(n => n.type === "folder").length,
            totalEdges: edges.length,
            totalClusters: clusters.length,
            mostConnectedFiles: mostConnected,
        },
    };
}

// --- Export for use in Mermaid and Sigma ---

export { CLUSTER_COLORS, MODULE_TYPE_COLORS, getExtension, getFilename, getParentDir };
