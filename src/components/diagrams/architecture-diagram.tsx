"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import cytoscape from "cytoscape";
// @ts-ignore
import fcose from "cytoscape-fcose";
import { MODULE_TYPE_COLORS } from "@/lib/constants";
import type { ArchitectureAnalysis, TreeItem } from "@/types";
import { Search, X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

if (typeof window !== "undefined") {
    cytoscape.use(fcose);
}

interface ArchitectureDiagramProps {
    analysis: ArchitectureAnalysis | null;
    owner: string;
    repo: string;
    tree?: TreeItem[];
}

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */
const DIR_COLORS: Record<string, string> = {
    src: "#3b82f6",
    app: "#6366f1",
    components: "#3b82f6",
    hooks: "#8b5cf6",
    lib: "#10b981",
    core: "#22c55e",
    utils: "#10b981",
    helpers: "#10b981",
    api: "#6366f1",
    pages: "#3b82f6",
    public: "#f97316",
    styles: "#ec4899",
    config: "#8b5cf6",
    tests: "#ef4444",
    __tests__: "#ef4444",
    test: "#ef4444",
    docs: "#64748b",
    types: "#06b6d4",
};

function guessColor(dirName: string): string {
    const lower = dirName.toLowerCase();
    for (const [key, color] of Object.entries(DIR_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return "#6b7280";
}

function guessRelationship(sourcePath: string, targetPath: string): string {
    const sDir = sourcePath.split("/").slice(-2, -1)[0] || "";
    const tDir = targetPath.split("/").slice(-2, -1)[0] || "";
    const sExt = sourcePath.split(".").pop() || "";
    const tExt = targetPath.split(".").pop() || "";
    const sName = sourcePath.split("/").pop()?.replace(/\.\w+$/, "") || "";

    if (sDir === "__tests__" || sDir === "test" || sName.includes("test") || sName.includes("spec")) return "tests";
    if (tDir === "components" || tExt === "tsx") {
        if (sDir === "pages" || sDir === "app") return "renders";
        if (sDir === "components") return "composes";
    }
    if (tDir === "hooks") return "uses";
    if (tDir === "lib" || tDir === "utils" || tDir === "helpers") return "imports";
    if (tDir === "styles" || tExt === "css" || tExt === "scss") return "styles";
    if (tDir === "types") return "types";
    if (tDir === "api" || tDir === "route") return "calls";
    if (sDir === "hooks" && tDir === "core") return "orchestrates";
    return "imports";
}

/* ------------------------------------------------------------------ */
/*  Build a rich graph from the file tree (fallback, no AI)            */
/* ------------------------------------------------------------------ */
function buildRichGraph(tree: TreeItem[], repo: string) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const dirSet = new Set<string>();

    // Collect all directories
    tree.forEach((item) => {
        const parts = item.path.split("/");
        for (let i = 1; i <= parts.length - (item.type === "blob" ? 1 : 0); i++) {
            dirSet.add(parts.slice(0, i).join("/"));
        }
    });

    // Create compound (parent) nodes for directories
    const sortedDirs = Array.from(dirSet).sort();
    sortedDirs.forEach((dir) => {
        const parts = dir.split("/");
        const label = parts[parts.length - 1];
        const parentDir = parts.slice(0, -1).join("/");
        nodes.push({
            data: {
                id: `dir:${dir}`,
                label: label,
                parent: parentDir ? `dir:${parentDir}` : undefined,
                type: "directory",
                color: guessColor(label),
                nodeKind: "group",
            },
        });
    });

    // Create file nodes
    const files = tree.filter((item) => item.type === "blob");
    const limitedFiles = files.slice(0, 200); // performance cap

    limitedFiles.forEach((item) => {
        const parts = item.path.split("/");
        const fileName = parts[parts.length - 1];
        const baseName = fileName.replace(/\.\w+$/, "");
        const ext = fileName.split(".").pop() || "";
        const parentDir = parts.slice(0, -1).join("/");

        // Determine color from parent directory
        const topDir = parts[0] || "";
        let color = guessColor(topDir);
        // Override for tests
        if (parentDir.includes("test") || parentDir.includes("__tests__") || fileName.includes("test")) {
            color = "#ef4444";
        }
        // Override for config files at root level
        if (parts.length === 1) {
            color = "#8b5cf6";
        }

        nodes.push({
            data: {
                id: `file:${item.path}`,
                label: baseName.length > 20 ? baseName.substring(0, 18) + "…" : baseName,
                fullLabel: fileName,
                parent: parentDir ? `dir:${parentDir}` : undefined,
                type: ext,
                path: item.path,
                color: color,
                nodeKind: "file",
                size: item.size,
            },
        });
    });

    // Infer edges: same-directory files are related, and directory barrels connect to their files
    const filesByDir = new Map<string, typeof limitedFiles>();
    limitedFiles.forEach((f) => {
        const dir = f.path.split("/").slice(0, -1).join("/");
        if (!filesByDir.has(dir)) filesByDir.set(dir, []);
        filesByDir.get(dir)!.push(f);
    });

    // Connect index/barrel files to siblings
    filesByDir.forEach((filesInDir) => {
        const indexFile = filesInDir.find((f) => {
            const name = f.path.split("/").pop() || "";
            return name.startsWith("index.") || name.startsWith("page.") || name.startsWith("layout.");
        });

        if (indexFile) {
            filesInDir.forEach((f) => {
                if (f !== indexFile) {
                    const rel = guessRelationship(indexFile.path, f.path);
                    edges.push({
                        data: {
                            id: `edge:${indexFile.path}-${f.path}`,
                            source: `file:${indexFile.path}`,
                            target: `file:${f.path}`,
                            label: rel,
                        },
                    });
                }
            });
        }
    });

    // Connect pages/app to components/hooks they likely use
    const pageFiles = limitedFiles.filter((f) => {
        const dir = f.path.split("/")[0];
        return dir === "app" || dir === "pages" || f.path.includes("/app/");
    });
    const hookFiles = limitedFiles.filter((f) => f.path.includes("hook"));
    const componentFiles = limitedFiles.filter((f) => {
        return f.path.includes("component") && !f.path.includes("test");
    });

    // Pages → components (renders)
    pageFiles.forEach((page) => {
        const pageName = page.path.split("/").pop()?.replace(/\.\w+$/, "") || "";
        if (pageName === "page" || pageName === "layout") {
            componentFiles.slice(0, 5).forEach((comp) => {
                edges.push({
                    data: {
                        id: `edge:${page.path}-${comp.path}`,
                        source: `file:${page.path}`,
                        target: `file:${comp.path}`,
                        label: "renders",
                    },
                });
            });
        }
    });

    // Hooks → core/lib (orchestrates)
    hookFiles.forEach((hook) => {
        const coreFiles = limitedFiles.filter((f) => f.path.includes("core/") || f.path.includes("lib/"));
        coreFiles.slice(0, 3).forEach((core) => {
            edges.push({
                data: {
                    id: `edge:${hook.path}-${core.path}`,
                    source: `file:${hook.path}`,
                    target: `file:${core.path}`,
                    label: "orchestrates",
                },
            });
        });
    });

    // Test files → the files they test
    const testFiles = limitedFiles.filter((f) => {
        const name = f.path.split("/").pop() || "";
        return name.includes(".test.") || name.includes(".spec.") || f.path.includes("__tests__");
    });

    testFiles.forEach((test) => {
        const testName = (test.path.split("/").pop() || "")
            .replace(/\.test\.\w+$/, "")
            .replace(/\.spec\.\w+$/, "");
        const target = limitedFiles.find((f) => {
            const fname = (f.path.split("/").pop() || "").replace(/\.\w+$/, "");
            return fname === testName && f !== test;
        });
        if (target) {
            edges.push({
                data: {
                    id: `edge:${test.path}-${target.path}`,
                    source: `file:${test.path}`,
                    target: `file:${target.path}`,
                    label: "tests",
                },
            });
        }
    });

    // Config files at root connect to the repo concept
    const rootConfigs = limitedFiles.filter((f) => !f.path.includes("/"));
    if (rootConfigs.length > 1) {
        const mainConfig = rootConfigs.find((f) => f.path.includes("package.json") || f.path.includes("next.config"));
        if (mainConfig) {
            rootConfigs.forEach((cfg) => {
                if (cfg !== mainConfig) {
                    edges.push({
                        data: {
                            id: `edge:${mainConfig.path}-${cfg.path}`,
                            source: `file:${mainConfig.path}`,
                            target: `file:${cfg.path}`,
                            label: "configures",
                        },
                    });
                }
            });
        }
    }

    return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Build graph from AI analysis                                       */
/* ------------------------------------------------------------------ */
function buildFromAnalysis(analysis: ArchitectureAnalysis) {
    const nodes: any[] = [];
    const edges: any[] = [];

    analysis.modules.forEach((mod) => {
        // Module group node
        nodes.push({
            data: {
                id: `group:${mod.name}`,
                label: mod.name,
                type: mod.type,
                color: MODULE_TYPE_COLORS[mod.type] || "#6b7280",
                nodeKind: "group",
                description: mod.description,
            },
        });

        // Individual file nodes inside modules
        mod.files.forEach((filePath) => {
            const fileName = filePath.split("/").pop() || filePath;
            const baseName = fileName.replace(/\.\w+$/, "");
            const ext = fileName.split(".").pop() || "";

            nodes.push({
                data: {
                    id: `file:${filePath}`,
                    label: baseName.length > 20 ? baseName.substring(0, 18) + "…" : baseName,
                    fullLabel: fileName,
                    parent: `group:${mod.name}`,
                    type: ext,
                    path: filePath,
                    color: MODULE_TYPE_COLORS[mod.type] || "#6b7280",
                    nodeKind: "file",
                },
            });
        });

        // Entry point highlighting
        if (mod.entryPoint) {
            const epNode = nodes.find((n) => n.data.id === `file:${mod.entryPoint}`);
            if (epNode) {
                epNode.data.isEntry = true;
            }
        }
    });

    // Module-to-module dependency edges (attach to entry files or first file)
    analysis.modules.forEach((mod) => {
        mod.dependencies.forEach((dep) => {
            const targetMod = analysis.modules.find((m) => m.name === dep);
            if (!targetMod) return;

            const sourceFile = mod.entryPoint || mod.files[0];
            const targetFile = targetMod.entryPoint || targetMod.files[0];
            if (!sourceFile || !targetFile) return;

            edges.push({
                data: {
                    id: `dep:${mod.name}-${dep}`,
                    source: `file:${sourceFile}`,
                    target: `file:${targetFile}`,
                    label: "depends",
                },
            });
        });
    });

    // Data flow edges
    analysis.dataFlow.forEach((flow, i) => {
        const sourceMod = analysis.modules.find((m) => m.name === flow.from);
        const targetMod = analysis.modules.find((m) => m.name === flow.to);
        if (!sourceMod || !targetMod) return;

        const sourceFile = sourceMod.entryPoint || sourceMod.files[0];
        const targetFile = targetMod.entryPoint || targetMod.files[0];
        if (!sourceFile || !targetFile) return;

        edges.push({
            data: {
                id: `flow:${i}`,
                source: `file:${sourceFile}`,
                target: `file:${targetFile}`,
                label: flow.description.length > 25 ? flow.description.substring(0, 23) + "…" : flow.description,
            },
        });
    });

    // Intra-module edges (barrel → siblings)
    analysis.modules.forEach((mod) => {
        const barrel = mod.files.find((f) => {
            const name = f.split("/").pop() || "";
            return name.startsWith("index.") || name.startsWith("page.");
        });
        if (barrel) {
            mod.files.forEach((f) => {
                if (f !== barrel) {
                    const rel = guessRelationship(barrel, f);
                    edges.push({
                        data: {
                            id: `intra:${barrel}-${f}`,
                            source: `file:${barrel}`,
                            target: `file:${f}`,
                            label: rel,
                        },
                    });
                }
            });
        }
    });

    return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function ArchitectureDiagram({
    analysis,
    owner,
    repo,
    tree,
}: ArchitectureDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedNode, setSelectedNode] = useState<any>(null);

    const elements = useMemo(() => {
        if (analysis && analysis.modules.length > 0) {
            return buildFromAnalysis(analysis);
        }
        if (tree && tree.length > 0) {
            return buildRichGraph(tree, repo);
        }
        return { nodes: [], edges: [] };
    }, [analysis, tree, repo]);

    // Legend from unique colors
    const legend = useMemo(() => {
        const seen = new Map<string, string>();
        elements.nodes.forEach((n: any) => {
            if (n.data.nodeKind === "group" && n.data.label && n.data.color) {
                seen.set(n.data.label, n.data.color);
            }
        });
        return Array.from(seen.entries()).map(([label, color]) => ({ label, color }));
    }, [elements]);

    const stats = useMemo(() => {
        const fileNodes = elements.nodes.filter((n: any) => n.data.nodeKind === "file").length;
        const groupNodes = elements.nodes.filter((n: any) => n.data.nodeKind === "group").length;
        return { files: fileNodes, groups: groupNodes, edges: elements.edges.length };
    }, [elements]);

    useEffect(() => {
        if (!containerRef.current || elements.nodes.length === 0) return;

        const cy = cytoscape({
            container: containerRef.current,
            elements: elements,
            style: [
                // Compound / group nodes
                {
                    selector: 'node[nodeKind="group"]',
                    style: {
                        "background-color": "data(color)",
                        "background-opacity": 0.08,
                        "border-width": 2,
                        "border-color": "data(color)",
                        "border-opacity": 0.5,
                        label: "data(label)",
                        "text-valign": "top",
                        "text-halign": "center",
                        "font-size": "13px",
                        "font-weight": "bold",
                        "font-family": "'Inter', system-ui, sans-serif",
                        color: "data(color)",
                        "text-margin-y": -5,
                        shape: "round-rectangle",
                        padding: "20px",
                    } as any,
                },
                // File nodes
                {
                    selector: 'node[nodeKind="file"]',
                    style: {
                        "background-color": "data(color)",
                        label: "data(label)",
                        "text-valign": "center",
                        "text-halign": "center",
                        "font-size": "10px",
                        "font-weight": "bold",
                        "font-family": "'Inter', system-ui, sans-serif",
                        color: "#fff",
                        shape: "round-rectangle",
                        width: (ele: any) => {
                            const label = ele.data("label") || "";
                            return Math.max(100, label.length * 8 + 24);
                        },
                        height: 36,
                        "border-width": 2,
                        "border-color": "data(color)",
                        "text-wrap": "ellipsis",
                        "text-max-width": "95px",
                    } as any,
                },
                // Entry point marker
                {
                    selector: "node[isEntry]",
                    style: {
                        "border-width": 3,
                        "border-style": "dashed",
                        "border-color": "#facc15",
                    },
                },
                // Edges
                {
                    selector: "edge",
                    style: {
                        width: 1.5,
                        "line-color": "#64748b",
                        "target-arrow-color": "#64748b",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier",
                        "arrow-scale": 0.8,
                        label: "data(label)",
                        "font-size": "8px",
                        "font-family": "monospace",
                        color: "#94a3b8",
                        "text-rotation": "autorotate",
                        "text-margin-y": -8,
                        "text-outline-width": 2,
                        "text-outline-color": "#0f172a",
                        opacity: 0.6,
                    },
                },
                // Selected
                {
                    selector: "node:selected",
                    style: {
                        "border-width": 3,
                        "border-color": "#facc15",
                    },
                },
            ] as any,
            layout: {
                name: "fcose",
                quality: "default",
                randomize: true,
                animate: true,
                animationDuration: 800,
                fit: true,
                padding: 30,
                nodeRepulsion: 6000,
                idealEdgeLength: 80,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 0.3,
                numIter: 2500,
                gravityRange: 3.8,
                gravityCompound: 1.0,
                gravityRangeCompound: 1.5,
                tilingPaddingVertical: 10,
                tilingPaddingHorizontal: 10,
                initialTemp: 200,
                coolingFactor: 0.3,
            } as any,
            wheelSensitivity: 0.2,
        });

        cy.on("tap", "node", (evt) => {
            const data = evt.target.data();
            setSelectedNode(data);
            cy.animate({ center: { eles: evt.target }, duration: 300, easing: "ease-out-quad" });
        });
        cy.on("tap", (evt) => { if (evt.target === cy) setSelectedNode(null); });
        cy.on("mouseover", "node", () => { if (containerRef.current) containerRef.current.style.cursor = "pointer"; });
        cy.on("mouseout", "node", () => { if (containerRef.current) containerRef.current.style.cursor = "default"; });

        cyRef.current = cy;
        return () => cy.destroy();
    }, [elements]);

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        const cy = cyRef.current;
        if (!cy) return;

        cy.nodes().forEach((n: any) => {
            n.style("opacity", 1);
            if (n.data("nodeKind") === "file") {
                n.style("border-width", 2);
                n.style("border-color", n.data("color"));
            }
        });
        cy.edges().style("opacity", 0.6);

        if (!query.trim()) return;
        const q = query.toLowerCase();
        const matched = cy.nodes().filter((node: any) => {
            const label = (node.data("label") || "").toLowerCase();
            const fullLabel = (node.data("fullLabel") || "").toLowerCase();
            const path = (node.data("path") || "").toLowerCase();
            return label.includes(q) || fullLabel.includes(q) || path.includes(q);
        });

        if (matched.length > 0) {
            cy.nodes().style("opacity", 0.12);
            cy.edges().style("opacity", 0.05);
            matched.style("opacity", 1);
            matched.style("border-width", 3);
            matched.style("border-color", "#facc15");
            matched.connectedEdges().style("opacity", 0.8);
            // Also show parent groups
            matched.parents().style("opacity", 0.6);
        }
    }, []);

    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2);
    const handleFit = () => cyRef.current?.fit(undefined, 30);

    if (elements.nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">📊</div>
                    <p className="text-sm text-gray-400">No architecture data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            {/* Search */}
            <div className="absolute top-3 left-3 z-10">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-8 pr-8 py-1.5 w-56 text-xs font-mono bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                    />
                    {searchQuery && (
                        <button onClick={() => handleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-3 px-3 py-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300">
                <span><strong className="text-purple-400">{stats.files}</strong> files</span>
                <span className="text-slate-600">|</span>
                <span><strong className="text-cyan-400">{stats.groups}</strong> groups</span>
                <span className="text-slate-600">|</span>
                <span><strong className="text-blue-400">{stats.edges}</strong> connections</span>
                {analysis && (
                    <>
                        <span className="text-slate-600">|</span>
                        <span className="text-emerald-400">{analysis.architecturePattern}</span>
                    </>
                )}
            </div>

            {/* Graph */}
            <div ref={containerRef} className="w-full h-full min-h-[800px] bg-slate-950 rounded-xl" />

            {/* Legend */}
            <div className="absolute bottom-4 right-4 z-10 p-3 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg max-w-[200px] max-h-[250px] overflow-y-auto">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Groups</div>
                <div className="space-y-1">
                    {legend.map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-2 text-[11px]">
                            <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0 border border-white/10" style={{ backgroundColor: color }} />
                            <span className="text-slate-300 truncate">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Zoom */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
                <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-900/80 backdrop-blur border border-slate-700 hover:bg-slate-800" onClick={handleZoomIn}>
                    <ZoomIn className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-900/80 backdrop-blur border border-slate-700 hover:bg-slate-800" onClick={handleZoomOut}>
                    <ZoomOut className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-900/80 backdrop-blur border border-slate-700 hover:bg-slate-800" onClick={handleFit}>
                    <Maximize2 className="w-4 h-4" />
                </Button>
            </div>

            {/* Detail panel */}
            {selectedNode ? (
                <div className="absolute top-14 right-3 z-20 w-72 p-4 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-white truncate">{selectedNode.fullLabel || selectedNode.label}</h3>
                        <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-2 text-[11px]">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: selectedNode.color || "#6b7280" }} />
                            <span className="text-slate-400">Kind:</span>
                            <span className="text-white capitalize">{selectedNode.nodeKind}</span>
                        </div>
                        {selectedNode.path && (
                            <div className="break-all">
                                <span className="text-slate-400">Path: </span>
                                <span className="text-slate-300 font-mono text-[10px]">{selectedNode.path}</span>
                            </div>
                        )}
                        {selectedNode.description && (
                            <div>
                                <span className="text-slate-400">Description: </span>
                                <span className="text-slate-300">{selectedNode.description}</span>
                            </div>
                        )}
                        {selectedNode.type && selectedNode.nodeKind === "file" && (
                            <div>
                                <span className="text-slate-400">Extension: </span>
                                <span className="text-white">.{selectedNode.type}</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="absolute top-14 right-3 z-10 px-3 py-2 bg-slate-900/60 backdrop-blur border border-slate-700/50 rounded-md">
                    <span className="text-[11px] text-slate-500 italic">Click on a node to view details</span>
                </div>
            )}
        </div>
    );
}
