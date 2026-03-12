"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import cytoscape from "cytoscape";
// @ts-ignore
import fcose from "cytoscape-fcose";
import { getFileColor } from "@/lib/file-icons";
import type { TreeItem, FileNodeData } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Maximize2, ZoomIn, ZoomOut, Search, X } from "lucide-react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";

// Map file extensions to Prism language keys
const extToPrismLang: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", css: "css", scss: "css", html: "markup",
    json: "json", md: "markdown", sh: "bash", bash: "bash",
    go: "go", rs: "rust", sql: "sql", yaml: "yaml", yml: "yaml",
    java: "java", c: "c", cpp: "cpp", h: "c",
    xml: "markup", svg: "markup",
};

// Register the fcose layout extension
if (typeof window !== "undefined") {
    cytoscape.use(fcose);
}

interface FileTreeGraphProps {
    tree: TreeItem[];
    owner: string;
    repo: string;
}

export default function FileTreeGraph({ tree, owner, repo }: FileTreeGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const [selectedFile, setSelectedFile] = useState<FileNodeData | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    // Binary file extensions that shouldn't be fetched
    const BINARY_EXTENSIONS = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp',
        'mp4', 'webm', 'mp3', 'wav', 'ogg',
        'zip', 'tar', 'gz', 'rar', '7z',
        'pdf', 'doc', 'docx', 'xls', 'xlsx',
        'woff', 'woff2', 'ttf', 'eot', 'otf',
        'exe', 'dll', 'so', 'dylib',
        'lock',
    ]);

    const MAX_FILE_SIZE = 500_000; // 500KB limit for preview

    const fetchFileContent = useCallback(async (file: FileNodeData) => {
        setFileLoading(true);
        setFileContent(null);
        setFileError(null);

        const ext = file.extension?.toLowerCase() ?? '';
        if (BINARY_EXTENSIONS.has(ext)) {
            setFileError(`Binary file (.${ext}) — preview not available`);
            setFileLoading(false);
            return;
        }

        if (file.size && file.size > MAX_FILE_SIZE) {
            setFileError(`File too large (${formatBytes(file.size)}) — preview not available`);
            setFileLoading(false);
            return;
        }

        try {
            const res = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            setFileContent(text);
        } catch (err) {
            setFileError("Could not load file content");
        } finally {
            setFileLoading(false);
        }
    }, [owner, repo]);

    // Fetch file content when a file is selected
    useEffect(() => {
        if (selectedFile && selectedFile.type !== 'folder') {
            fetchFileContent(selectedFile);
        } else {
            setFileContent(null);
            setFileError(null);
        }
    }, [selectedFile, fetchFileContent]);

    // Build graph elements — show all files
    const elements = useMemo(() => {
        const nodes: any[] = [];
        const edges: any[] = [];
        const addedFolders = new Set<string>();

        // Show all files (cap at 2000 to prevent browser crash)
        const limitedItems = tree.slice(0, 2000);

        // Duplicate names in large folders can look conflicting; add context labels when needed.
        const itemNameCounts = new Map<string, number>();
        limitedItems.forEach((item) => {
            const parts = item.path.split("/");
            const label = parts[parts.length - 1]?.toLowerCase() || "";
            const key = `${item.type}:${label}`;
            itemNameCounts.set(key, (itemNameCounts.get(key) || 0) + 1);
        });

        const getDisplayLabel = (path: string, label: string, kind: "tree" | "blob") => {
            const key = `${kind}:${label.toLowerCase()}`;
            const count = itemNameCounts.get(key) || 0;
            if (count <= 1) return label;
            const parts = path.split("/");
            const parentParts = parts.slice(0, -1);
            const context = parentParts.slice(-2).join("/");
            return context ? `${context}/${label}` : label;
        };

        const getCompactLabel = (value: string, max = 24) => {
            if (value.length <= max) return value;
            return `${value.slice(0, Math.max(6, max - 1))}…`;
        };

        // Count children per folder for sizing
        const folderChildCount = new Map<string, number>();
        limitedItems.forEach((item) => {
            const parts = item.path.split("/");
            const parentPath = parts.slice(0, -1).join("/");
            const key = parentPath || "__root__";
            folderChildCount.set(key, (folderChildCount.get(key) || 0) + 1);
        });

        // Root Node — scale by total children
        const rootChildren = folderChildCount.get("__root__") || 1;
        nodes.push({
            data: {
                id: "root",
                label: repo,
                displayLabel: repo,
                compactLabel: getCompactLabel(repo, 20),
                path: "",
                type: "folder",
                size: Math.min(80, 50 + rootChildren),
                color: "#6366f1",
                showLabel: 1,
            },
        });

        // Helper to ensure parent folders exist
        const ensureFolder = (folderPath: string) => {
            if (addedFolders.has(folderPath)) return;
            addedFolders.add(folderPath);

            const parts = folderPath.split("/");
            const label = parts[parts.length - 1];
            const displayLabel = getDisplayLabel(folderPath, label, "tree");
            const parentPath = parts.slice(0, -1).join("/");
            const parentId = parentPath === "" ? "root" : `folder:${parentPath}`;

            // Ensure parent exists first
            if (parentPath && !addedFolders.has(parentPath)) {
                ensureFolder(parentPath);
            }

            const childCount = folderChildCount.get(folderPath) || 0;
            const folderSize = Math.min(55, 30 + Math.sqrt(childCount) * 4);

            nodes.push({
                data: {
                    id: `folder:${folderPath}`,
                    label: childCount > 5 ? `${label} (${childCount})` : label,
                    displayLabel: childCount > 5 ? `${displayLabel} (${childCount})` : displayLabel,
                    compactLabel: getCompactLabel(childCount > 5 ? `${displayLabel} (${childCount})` : displayLabel, 22),
                    path: folderPath,
                    type: "folder",
                    size: folderSize,
                    color: "#ec4899",
                    childCount,
                    // In large repos, only keep labels always-on for root-level or high-fanout folders.
                    showLabel: folderPath.split("/").length === 1 || childCount >= 10 ? 1 : 0,
                },
            });

            edges.push({
                data: {
                    id: `edge:${parentId}-folder:${folderPath}`,
                    source: parentId,
                    target: `folder:${folderPath}`,
                },
            });
        };

        limitedItems.forEach((item) => {
            const parts = item.path.split("/");
            const isFolder = item.type === "tree";
            const label = parts[parts.length - 1];
            const displayLabel = getDisplayLabel(item.path, label, isFolder ? "tree" : "blob");
            const parentPath = parts.slice(0, -1).join("/");
            const parentId = parentPath === "" ? "root" : `folder:${parentPath}`;

            if (isFolder) {
                ensureFolder(item.path);
            } else {
                // Ensure parent folder exists
                if (parentPath && !addedFolders.has(parentPath)) {
                    ensureFolder(parentPath);
                }

                const ext = label.split(".").pop();
                nodes.push({
                    data: {
                        id: `file:${item.path}`,
                        label,
                        displayLabel,
                        compactLabel: getCompactLabel(displayLabel, 20),
                        path: item.path,
                        type: "file",
                        extension: ext,
                        size: item.size ? Math.max(12, Math.min(25, Math.log10(item.size) * 5)) : 12,
                        color: getFileColor(label),
                        rawSize: item.size,
                    },
                });

                edges.push({
                    data: {
                        id: `edge:${parentId}-file:${item.path}`,
                        source: parentId,
                        target: `file:${item.path}`,
                    },
                });
            }
        });

        return { nodes, edges };
    }, [tree, repo]);

    // Is this a large repo?
    const isLargeRepo = elements.nodes.length > 80;

    // Compute cluster info from elements
    const clusterInfo = useMemo(() => {
        const folders = elements.nodes.filter((n: any) => n.data.type === "folder").length;
        const files = elements.nodes.filter((n: any) => n.data.type === "file").length;
        // Count unique extensions
        const extMap = new Map<string, number>();
        elements.nodes.forEach((n: any) => {
            if (n.data.extension) {
                extMap.set(n.data.extension, (extMap.get(n.data.extension) || 0) + 1);
            }
        });
        // Sort by count descending, take top 8
        const topExtensions = Array.from(extMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([ext, count]) => ({ ext, count, color: getFileColor(`file.${ext}`) }));
        return { folders, files, topExtensions };
    }, [elements]);

    const clearNodeFocus = useCallback((cy: cytoscape.Core) => {
        cy.nodes().forEach(node => {
            node.style('opacity', 1);
            node.style('border-width', node.data('type') === 'folder' ? 2 : 0);
            node.style('border-color', node.data('type') === 'folder' ? 'rgba(255,255,255,0.4)' : 'transparent');
            if (isLargeRepo && node.data('type') === 'file') {
                node.style('label', '');
            }
        });

        cy.edges().forEach(edge => {
            edge.style('opacity', 0.6);
            edge.style('width', 1);
            edge.style('line-color', '#334155');
        });
    }, [isLargeRepo]);

    const focusNodeNeighborhood = useCallback((cy: cytoscape.Core, node: cytoscape.NodeSingular) => {
        // Dim everything first, then re-highlight connected context.
        cy.nodes().style('opacity', 0.12);
        cy.edges().style('opacity', 0.06);

        const neighborhood = node.closedNeighborhood();
        neighborhood.nodes().style('opacity', 1);
        neighborhood.edges().style('opacity', 0.92);
        neighborhood.edges().style('width', 2);
        neighborhood.edges().style('line-color', '#64748b');

        // Primary focus node gets strongest emphasis.
        node.style('border-width', 3);
        node.style('border-color', '#facc15');

        // Improve readability in large repos by revealing labels for focused neighborhood.
        if (isLargeRepo) {
            neighborhood.nodes().forEach(n => {
                n.style('label', n.data('compactLabel') || n.data('displayLabel') || n.data('label'));
            });
        }
    }, [isLargeRepo]);

    // Search handler
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        const cy = cyRef.current;
        if (!cy) return;

        // Reset any prior focus state before applying search highlight.
        clearNodeFocus(cy);

        if (!query.trim()) return;

        const q = query.toLowerCase();
        const matched = cy.nodes().filter(node => {
            const label = (node.data('label') || '').toLowerCase();
            const path = (node.data('path') || '').toLowerCase();
            return label.includes(q) || path.includes(q);
        });

        if (matched.length > 0) {
            // Dim non-matching
            cy.nodes().style('opacity', 0.15);
            cy.edges().style('opacity', 0.08);
            // Highlight matched
            matched.style('opacity', 1);
            matched.style('border-width', 3);
            matched.style('border-color', '#facc15');
            // Show labels on matched nodes
            matched.forEach(node => {
                node.style('label', node.data('compactLabel') || node.data('displayLabel') || node.data('label'));
            });
            // Also highlight their edges
            matched.connectedEdges().style('opacity', 0.8);
        }
    }, [clearNodeFocus]);

    useEffect(() => {
        if (!containerRef.current) return;

        // Scale layout params based on graph size
        const nodeCount = elements.nodes.length;
        const repulsion = nodeCount > 200 ? 45000 : nodeCount > 100 ? 30000 : 12000;
        const edgeLen = nodeCount > 200 ? 200 : nodeCount > 100 ? 150 : 100;
        const gravityVal = nodeCount > 200 ? 0.1 : 0.25;

        // Initialize cytoscape
        const cy = cytoscape({
            container: containerRef.current,
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': 'data(color)',
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'label': isLargeRepo ? '' : 'data(displayLabel)',
                        'color': '#ffffff',
                        'text-valign': 'center',
                        'text-halign': 'right',
                        'text-margin-x': 8,
                        'font-size': '11px',
                        'font-family': 'monospace',
                        'text-wrap': 'ellipsis',
                        'text-max-width': '150px',
                        'text-outline-width': 1.5,
                        'text-outline-color': '#0f172a',
                        'text-outline-opacity': 0.8,
                    }
                },
                {
                    selector: 'node[type="folder"]',
                    style: {
                        'border-width': 2,
                        'border-color': 'rgba(255, 255, 255, 0.4)',
                        'font-weight': 'bold',
                        'font-size': '12px',
                        'label': isLargeRepo ? '' : 'data(displayLabel)',
                    }
                },
                {
                    selector: 'node[type="folder"][showLabel = 1]',
                    style: {
                        'label': isLargeRepo ? 'data(compactLabel)' : 'data(displayLabel)',
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': '#334155',
                        'opacity': 0.4,
                        'curve-style': 'bezier',
                        'control-point-step-size': 40
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 3,
                        'border-color': '#ffffff'
                    }
                }
            ],
            layout: {
                name: 'fcose',
                quality: "default",
                randomize: true,
                animate: true,
                animationDuration: 1000,
                fit: true,
                nodeRepulsion: repulsion,
                idealEdgeLength: edgeLen,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: gravityVal,
                numIter: 2500,
                tilingPaddingVertical: 20,
                tilingPaddingHorizontal: 20,
                gravityRangeCompound: 1.5,
                gravityCompound: 1.0,
                gravityRange: 3.8,
                initialTemp: 271,
                coolingFactor: 0.3
            } as any,
            wheelSensitivity: 0.2,
        });

        // Add event listeners
        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const data = node.data();

            focusNodeNeighborhood(cy, node);

            // Pan to node
            cy.animate({
                center: { eles: node },
                duration: 300,
                easing: 'ease-out-quad'
            });

            if (data.type === "file") {
                setSelectedFile({
                    label: data.label,
                    path: data.path,
                    type: "file",
                    extension: data.extension,
                    size: data.rawSize
                });
            }
        });

        // Tap on empty canvas resets node-focus context.
        cy.on('tap', (evt) => {
            if (evt.target === cy) {
                clearNodeFocus(cy);
            }
        });

        // Cursor styles + hover labels
        cy.on('mouseover', 'node', (evt) => {
            if (containerRef.current) containerRef.current.style.cursor = 'pointer';
            const node = evt.target;
            // Show label on hover for file nodes in large repos
            if (isLargeRepo && node.data('type') === 'file') {
                node.style('label', node.data('compactLabel') || node.data('displayLabel') || node.data('label'));
                node.style('font-size', '11px');
                node.style('z-index', 999);
            }
        });

        cy.on('mouseout', 'node', (evt) => {
            if (containerRef.current) containerRef.current.style.cursor = 'default';
            const node = evt.target;
            // Hide label on mouseout for file nodes in large repos
            if (isLargeRepo && node.data('type') === 'file') {
                node.style('label', '');
                node.style('z-index', 0);
            }
        });

        cyRef.current = cy;

        return () => {
            cy.destroy();
        };
    }, [elements, isLargeRepo, clearNodeFocus, focusNodeNeighborhood]);

    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2);
    const handleFit = () => cyRef.current?.fit(undefined, 50);

    return (
        <div className="relative w-full h-full">
            {/* Search bar overlay */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
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
                        <button
                            onClick={() => handleSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats bar overlay */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-3 px-3 py-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300">
                <span><strong className="text-purple-400">{elements.nodes.length}</strong> nodes</span>
                <span className="text-slate-600">|</span>
                <span><strong className="text-blue-400">{elements.edges.length}</strong> edges</span>
            </div>

            {/* Cytoscape Container */}
            <div ref={containerRef} className="w-full h-full min-h-[800px] bg-slate-950 rounded-xl" />

            {/* Cluster info overlay */}
            <div className="absolute bottom-4 right-4 z-10 p-3 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg min-w-[160px]">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Cluster Info</div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#6366f1] inline-block flex-shrink-0" />
                        <span className="text-slate-300">Root</span>
                        <span className="ml-auto text-slate-500">1</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899] inline-block flex-shrink-0" />
                        <span className="text-slate-300">Folders</span>
                        <span className="ml-auto text-slate-500">{clusterInfo.folders}</span>
                    </div>
                    {clusterInfo.topExtensions.map(({ ext, count, color }) => (
                        <div key={ext} className="flex items-center gap-2 text-[11px]">
                            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-slate-300">.{ext}</span>
                            <span className="ml-auto text-slate-500">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls overlay */}
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

            {/* File Code Preview Panel */}
            {selectedFile && (
                <div className="absolute top-0 right-0 bottom-0 w-[480px] z-20 bg-[#0a0e1a]/95 backdrop-blur-xl border-l border-border/30 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold truncate">{selectedFile.label}</span>
                            {selectedFile.extension && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0"
                                    style={{ borderColor: getFileColor(selectedFile.label) + "40", color: getFileColor(selectedFile.label) }}
                                >
                                    .{selectedFile.extension}
                                </Badge>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 shrink-0"
                            onClick={() => setSelectedFile(null)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* File meta */}
                    <div className="px-4 py-2 border-b border-border/20 text-xs text-muted-foreground space-y-1">
                        <div className="truncate">
                            <span className="font-medium text-foreground/80">Path:</span> {selectedFile.path}
                        </div>
                        {selectedFile.size !== undefined && (
                            <div>
                                <span className="font-medium text-foreground/80">Size:</span> {formatBytes(selectedFile.size)}
                            </div>
                        )}
                    </div>

                    {/* Code Content */}
                    <div className="flex-1 overflow-auto">
                        {fileLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground">Loading file...</p>
                                </div>
                            </div>
                        ) : fileError ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center px-6">
                                    <div className="text-3xl mb-2">📄</div>
                                    <p className="text-xs text-muted-foreground">{fileError}</p>
                                </div>
                            </div>
                        ) : fileContent !== null ? (
                            <pre className="text-[12px] leading-[1.6] font-mono" style={{ background: "transparent" }}>
                                <code>
                                    {(() => {
                                        const ext = selectedFile.extension?.toLowerCase() ?? "";
                                        const lang = extToPrismLang[ext];
                                        const grammar = lang && Prism.languages[lang];
                                        const highlighted = grammar
                                            ? Prism.highlight(fileContent!, grammar, lang)
                                            : null;
                                        const lines = highlighted
                                            ? highlighted.split("\n")
                                            : fileContent!.split("\n");
                                        return lines.map((line, i) => (
                                            <div key={i} className="flex hover:bg-white/[0.03] group">
                                                <span className="inline-block w-12 text-right pr-4 text-muted-foreground/40 select-none shrink-0 group-hover:text-muted-foreground/60">
                                                    {i + 1}
                                                </span>
                                                {highlighted ? (
                                                    <span
                                                        className="flex-1 whitespace-pre pr-4 break-all"
                                                        dangerouslySetInnerHTML={{ __html: line || " " }}
                                                    />
                                                ) : (
                                                    <span className="flex-1 text-slate-300 whitespace-pre pr-4 break-all">
                                                        {line || " "}
                                                    </span>
                                                )}
                                            </div>
                                        ));
                                    })()}
                                </code>
                            </pre>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-xs text-muted-foreground">Select a file to preview</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}
