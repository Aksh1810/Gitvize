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

    // Build graph elements
    const elements = useMemo(() => {
        const nodes: any[] = [];
        const edges: any[] = [];
        const addedFolders = new Set<string>();

        // Root Node
        nodes.push({
            data: {
                id: "root",
                label: repo,
                path: "",
                type: "folder",
                size: 60,
                color: "#6366f1",
            },
        });

        // Limit to prevent browser crash with massive repos
        const limitedItems = tree.slice(0, 500);

        limitedItems.forEach((item) => {
            const isFolder = item.type === "tree";
            const parts = item.path.split("/");
            const label = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join("/");
            const parentId = parentPath === "" ? "root" : `folder:${parentPath}`;

            if (isFolder) {
                if (!addedFolders.has(item.path)) {
                    addedFolders.add(item.path);
                    nodes.push({
                        data: {
                            id: `folder:${item.path}`,
                            label,
                            path: item.path,
                            type: "folder",
                            size: 40,
                            color: "#ec4899",
                        },
                    });

                    edges.push({
                        data: {
                            id: `edge:${parentId}-folder:${item.path}`,
                            source: parentId,
                            target: `folder:${item.path}`,
                        },
                    });
                }
            } else {
                const ext = label.split(".").pop();
                nodes.push({
                    data: {
                        id: `file:${item.path}`,
                        label,
                        path: item.path,
                        type: "file",
                        extension: ext,
                        size: item.size ? Math.max(15, Math.min(30, Math.log10(item.size) * 5)) : 15,
                        color: getFileColor(label),
                        rawSize: item.size
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

    // Search handler
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        const cy = cyRef.current;
        if (!cy) return;

        // Reset all nodes to normal
        cy.nodes().forEach(node => {
            node.style('opacity', 1);
            node.style('border-width', node.data('type') === 'folder' ? 2 : 0);
            node.style('border-color', node.data('type') === 'folder' ? 'rgba(255,255,255,0.4)' : 'transparent');
        });
        cy.edges().style('opacity', 0.6);

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
            // Also highlight their edges
            matched.connectedEdges().style('opacity', 0.8);
        }
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

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
                        'label': 'data(label)',
                        'color': '#ffffff',
                        'text-valign': 'center',
                        'text-halign': 'right',
                        'text-margin-x': 8,
                        'font-size': '11px',
                        'font-family': 'monospace',
                        'text-outline-width': 1.5,
                        'text-outline-color': '#0f172a', /* Dark slate to match dark mode */
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
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.5,
                        'line-color': '#475569',
                        'opacity': 0.6,
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
                // fCoSE parameters mapped from user's provided screenshot
                quality: "default",
                randomize: true,
                animate: true,
                animationDuration: 1000,
                fit: true,
                nodeRepulsion: 8000,
                idealEdgeLength: 100,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 0.25,
                numIter: 2500,
                tilingPaddingVertical: 10,
                tilingPaddingHorizontal: 10,
                gravityRangeCompound: 1.5,
                gravityCompound: 1.0,
                gravityRange: 3.8,
                initialTemp: 271,
                coolingFactor: 0.3
            } as any, // Cast to any because fcose specific options aren't in cytoscape core types
            wheelSensitivity: 0.2,
        });

        // Add event listeners
        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const data = node.data();

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

        // Cursor styles
        cy.on('mouseover', 'node', (evt) => {
            if (containerRef.current) containerRef.current.style.cursor = 'pointer';
        });

        cy.on('mouseout', 'node', (evt) => {
            if (containerRef.current) containerRef.current.style.cursor = 'default';
        });

        cyRef.current = cy;

        return () => {
            cy.destroy();
        };
    }, [elements]);

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
                            <pre className="text-[12px] leading-[1.6] font-mono">
                                <code>
                                    {fileContent.split('\n').map((line, i) => (
                                        <div key={i} className="flex hover:bg-white/[0.03] group">
                                            <span className="inline-block w-12 text-right pr-4 text-muted-foreground/40 select-none shrink-0 group-hover:text-muted-foreground/60">
                                                {i + 1}
                                            </span>
                                            <span className="flex-1 text-slate-300 whitespace-pre pr-4 break-all">
                                                {line || ' '}
                                            </span>
                                        </div>
                                    ))}
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
