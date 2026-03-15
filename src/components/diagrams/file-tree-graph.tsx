"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import cytoscape from "cytoscape";
// @ts-ignore
import fcose from "cytoscape-fcose";
import { getFileColor } from "@/lib/file-icons";
import { buildSymbolGraph, isAnalyzableCodeFile, type SymbolKind } from "@/lib/symbol-parser";
import type { TreeItem, FileNodeData } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Maximize2, ZoomIn, ZoomOut, Search, X, ChevronDown, ChevronRight, Folder, File, PanelLeftClose, PanelLeftOpen, Filter } from "lucide-react";
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

interface ExplorerNode {
    name: string;
    path: string;
    type: "folder" | "file";
    children?: ExplorerNode[];
    size?: number;
    extension?: string;
}

const SYMBOL_KIND_STYLE: Record<SymbolKind, { color: string; shape: string }> = {
    class: { color: "#f59e0b", shape: "hexagon" },
    function: { color: "#22c55e", shape: "ellipse" },
    interface: { color: "#06b6d4", shape: "round-rectangle" },
    type: { color: "#a855f7", shape: "diamond" },
    method: { color: "#f97316", shape: "triangle" },
    variable: { color: "#84cc16", shape: "pentagon" },
};

const MAX_SYMBOL_FILE_BYTES = 120_000;
const SYMBOL_FILE_LIMIT_SMALL = 50;
const SYMBOL_FILE_LIMIT_LARGE = 25;
const SYMBOL_KIND_ORDER: SymbolKind[] = ["variable", "function", "method", "interface", "type", "class"];

export default function FileTreeGraph({ tree, owner, repo }: FileTreeGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const symbolCacheRef = useRef(new Map<string, string>());
    const codeScrollRef = useRef<HTMLDivElement>(null);
    const [selectedFile, setSelectedFile] = useState<FileNodeData | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [symbolFocus, setSymbolFocus] = useState<string | null>(null);
    const [focusLine, setFocusLine] = useState<number | null>(null);
    const [showRoot, setShowRoot] = useState(true);
    const [showFolders, setShowFolders] = useState(true);
    const [showFiles, setShowFiles] = useState(true);
    const [showSymbols, setShowSymbols] = useState(true);
    const [showContainsEdges, setShowContainsEdges] = useState(true);
    const [showDefinesEdges, setShowDefinesEdges] = useState(true);
    const [showImportsEdges, setShowImportsEdges] = useState(true);
    const [showCallsEdges, setShowCallsEdges] = useState(true);
    const [showExtendsEdges, setShowExtendsEdges] = useState(true);
    const [showImplementsEdges, setShowImplementsEdges] = useState(true);
    const [symbolKindVisibility, setSymbolKindVisibility] = useState<Record<SymbolKind, boolean>>({
        class: true,
        function: true,
        interface: true,
        type: true,
        method: true,
        variable: true,
    });
    const [symbolLoading, setSymbolLoading] = useState(false);
    const [symbolError, setSymbolError] = useState<string | null>(null);
    const [showExplorer, setShowExplorer] = useState(false);
    const [showExplorerInspector, setShowExplorerInspector] = useState(false);
    const [explorerWidth, setExplorerWidth] = useState(220);
    const [showRightFilters, setShowRightFilters] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [nodeFiltersOpen, setNodeFiltersOpen] = useState(true);
    const [edgeFiltersOpen, setEdgeFiltersOpen] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set([""]));
    const resizingRef = useRef(false);
    const explorerWidthRef = useRef(220);
    const [symbolGraph, setSymbolGraph] = useState<ReturnType<typeof buildSymbolGraph>>({
        symbols: [],
        references: [],
    });
    const inspectorWidth = 360;
    const visibilityRef = useRef({
        showRoot: true,
        showFolders: true,
        showFiles: true,
        showSymbols: true,
        showContainsEdges: true,
        showDefinesEdges: true,
        showImportsEdges: true,
        showCallsEdges: true,
        showExtendsEdges: true,
        showImplementsEdges: true,
        symbolKindVisibility: {
            class: true,
            function: true,
            interface: true,
            type: true,
            method: true,
            variable: true,
        } as Record<SymbolKind, boolean>,
    });

    const explorerTree = useMemo<ExplorerNode>(() => {
        const rootNode: ExplorerNode = { name: repo, path: "", type: "folder", children: [] };
        const nodeMap = new Map<string, ExplorerNode>();
        nodeMap.set("", rootNode);

        tree.forEach((item) => {
            const parts = item.path.split("/");
            let currentPath = "";
            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const nextPath = currentPath ? `${currentPath}/${part}` : part;
                const isFile = isLast && item.type === "blob";

                if (!nodeMap.has(nextPath)) {
                    const node: ExplorerNode = {
                        name: part,
                        path: nextPath,
                        type: isFile ? "file" : "folder",
                        children: isFile ? undefined : [],
                        size: isFile ? item.size : undefined,
                        extension: isFile ? part.split(".").pop() : undefined,
                    };
                    nodeMap.set(nextPath, node);

                    const parent = nodeMap.get(currentPath);
                    if (parent?.children) {
                        parent.children.push(node);
                    }
                }

                currentPath = nextPath;
            });
        });

        const sortNodes = (node: ExplorerNode) => {
            if (!node.children) return;
            node.children.sort((a, b) => {
                if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            node.children.forEach(sortNodes);
        };

        sortNodes(rootNode);
        return rootNode;
    }, [repo, tree]);

    const toggleFolder = useCallback((path: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        explorerWidthRef.current = explorerWidth;
    }, [explorerWidth]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (!resizingRef.current) return;
            const nextWidth = Math.min(340, Math.max(180, event.clientX));
            setExplorerWidth(nextWidth);
        };

        const handleMouseUp = () => {
            if (!resizingRef.current) return;
            resizingRef.current = false;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

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

    useEffect(() => {
        if (!fileContent || !symbolFocus) {
            setFocusLine(null);
            return;
        }

        const matcher = new RegExp(`\\b${escapeRegExp(symbolFocus)}\\b`);
        const lines = fileContent.split("\n");
        const matchIndex = lines.findIndex((line) => matcher.test(line));
        setFocusLine(matchIndex >= 0 ? matchIndex + 1 : null);
    }, [fileContent, symbolFocus]);

    useEffect(() => {
        if (!focusLine || !codeScrollRef.current) return;
        const container = codeScrollRef.current;
        const target = container.querySelector(`[data-line="${focusLine}"]`);
        if (target instanceof HTMLElement) {
            const targetTop = target.offsetTop - container.clientHeight * 0.4;
            container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
        }
    }, [focusLine]);

    useEffect(() => {
        let cancelled = false;

        const runSymbolAnalysis = async () => {
            if (!showSymbols) {
                setSymbolError(null);
                setSymbolLoading(false);
                return;
            }

            const sourceFiles = tree
                .filter((item) => item.type === "blob" && isAnalyzableCodeFile(item.path) && (item.size ?? 0) <= MAX_SYMBOL_FILE_BYTES)
                .slice(0, tree.length > 800 ? SYMBOL_FILE_LIMIT_LARGE : SYMBOL_FILE_LIMIT_SMALL);

            if (sourceFiles.length === 0) {
                setSymbolGraph({ symbols: [], references: [] });
                setSymbolError(null);
                setSymbolLoading(false);
                return;
            }

            setSymbolLoading(true);
            setSymbolError(null);

            const filePayload: Array<{ path: string; content: string }> = [];
            const queue = [...sourceFiles];
            const workers = Array.from({ length: 5 }, async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (!item || cancelled) return;

                    const cacheKey = `${owner}/${repo}/${item.path}`;
                    const cached = symbolCacheRef.current.get(cacheKey);
                    if (cached !== undefined) {
                        filePayload.push({ path: item.path, content: cached });
                        continue;
                    }

                    try {
                        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${item.path}`);
                        if (!res.ok) continue;
                        const text = await res.text();
                        symbolCacheRef.current.set(cacheKey, text);
                        filePayload.push({ path: item.path, content: text });
                    } catch {
                        // Ignore per-file fetch failures and continue with available content.
                    }
                }
            });

            await Promise.all(workers);
            if (cancelled) return;

            if (filePayload.length === 0) {
                setSymbolGraph({ symbols: [], references: [] });
                setSymbolError("Could not fetch source files for symbol graph");
                setSymbolLoading(false);
                return;
            }

            const graph = buildSymbolGraph(filePayload, {
                maxReferences: tree.length > 800 ? 220 : 420,
            });

            setSymbolGraph(graph);
            setSymbolLoading(false);
        };

        runSymbolAnalysis();

        return () => {
            cancelled = true;
        };
    }, [owner, repo, showSymbols, tree]);

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
            // Always just the file/folder name, never a partial path
            return label;
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
                    type: "contains",
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
                        displayLabel: label, // Only file name
                        compactLabel: getCompactLabel(label, 20),
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
                        type: "contains",
                    },
                });
            }
        });

        if (symbolGraph.symbols.length > 0) {
            const nodeIdSet = new Set<string>(nodes.map((node) => node.data.id));
            const edgeIdSet = new Set<string>(edges.map((edge) => edge.data.id));
            const limitedByTreeSize = limitedItems.length > 800;

            symbolGraph.symbols.forEach((symbol) => {
                const fileNodeId = `file:${symbol.filePath}`;
                if (!nodeIdSet.has(fileNodeId)) return;

                const style = SYMBOL_KIND_STYLE[symbol.kind];
                const symbolId = `symbol:${symbol.filePath}:${symbol.kind}:${symbol.name}`;
                if (!nodeIdSet.has(symbolId)) {
                    nodeIdSet.add(symbolId);
                    // Always just the symbol name, never a path
                    nodes.push({
                        data: {
                            id: symbolId,
                            label: symbol.name,
                            displayLabel: symbol.name,
                            compactLabel: getCompactLabel(symbol.name, 16),
                            path: symbol.filePath,
                            parentPath: symbol.filePath,
                            type: "symbol",
                            symbolKind: symbol.kind,
                            size: symbol.kind === "method" || symbol.kind === "variable" ? 9 : 11,
                            color: style.color,
                        },
                    });
                }

                const containsId = `edge:${fileNodeId}-${symbolId}`;
                if (!edgeIdSet.has(containsId)) {
                    edgeIdSet.add(containsId);
                    edges.push({
                        data: {
                            id: containsId,
                            source: fileNodeId,
                            target: symbolId,
                            type: "defines",
                        },
                    });
                }
            });

            symbolGraph.references.forEach((ref) => {
                if (limitedByTreeSize && ref.confidence !== "high") return;

                const sourceFileId = `file:${ref.fromFilePath}`;
                const sourceSymbolId = ref.fromSymbolName && ref.fromSymbolKind
                    ? `symbol:${ref.fromFilePath}:${ref.fromSymbolKind}:${ref.fromSymbolName}`
                    : null;
                const targetPrefix = `symbol:${ref.toFilePath}:${ref.targetKind}:${ref.symbolName}`;
                const sourceId = sourceSymbolId && nodeIdSet.has(sourceSymbolId) ? sourceSymbolId : sourceFileId;
                if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetPrefix)) return;

                const refId = `edge:${sourceId}-${targetPrefix}:${ref.relation}`;
                if (edgeIdSet.has(refId)) return;
                edgeIdSet.add(refId);
                edges.push({
                    data: {
                        id: refId,
                        source: sourceId,
                        target: targetPrefix,
                        type: ref.relation,
                        confidence: ref.confidence,
                    },
                });
                });
        }

        return { nodes, edges };
    }, [tree, repo, symbolGraph]);

    // Is this a large repo?
    const isLargeRepo = elements.nodes.length > 80;

    // Compute cluster info from elements
    const clusterInfo = useMemo(() => {
        const folders = elements.nodes.filter((n: any) => n.data.type === "folder").length;
        const files = elements.nodes.filter((n: any) => n.data.type === "file").length;
        const symbols = elements.nodes.filter((n: any) => n.data.type === "symbol").length;
        const symbolRefs = elements.edges.filter((e: any) => ["imports", "calls", "extends", "implements"].includes(e.data.type)).length;
        const symbolKinds = new Map<string, number>();
        const symbolTotals = new Map<string, number>();
        // Count unique extensions
        const extMap = new Map<string, number>();
        elements.nodes.forEach((n: any) => {
            if (n.data.extension) {
                extMap.set(n.data.extension, (extMap.get(n.data.extension) || 0) + 1);
            }
            if (n.data.type === "symbol" && n.data.symbolKind) {
                const kind = String(n.data.symbolKind);
                symbolKinds.set(kind, (symbolKinds.get(kind) || 0) + 1);
            }
        });
        symbolGraph.symbols.forEach((symbol) => {
            symbolTotals.set(symbol.kind, (symbolTotals.get(symbol.kind) || 0) + 1);
        });
        // Sort by count descending, take top 8
        const topExtensions = Array.from(extMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([ext, count]) => ({ ext, count, color: getFileColor(`file.${ext}`) }));
        return { folders, files, symbols, symbolRefs, topExtensions, symbolKinds, symbolTotals };
    }, [elements, symbolGraph.symbols]);

    const applyVisibility = useCallback((targetCy?: cytoscape.Core | null) => {
        const cy = targetCy ?? cyRef.current;
        if (!cy) return;

        const state = visibilityRef.current;
        cy.batch(() => {
            cy.getElementById("root").style("display", state.showRoot ? "element" : "none");
            cy.nodes('node[type="folder"]').not('#root').style("display", state.showFolders ? "element" : "none");
            cy.nodes('node[type="file"]').style("display", state.showFiles ? "element" : "none");

            const symbolsVisible = state.showSymbols && state.showFiles;
            cy.nodes('node[type="symbol"]').forEach((node) => {
                const kind = node.data("symbolKind") as SymbolKind | undefined;
                const kindVisible = kind ? state.symbolKindVisibility[kind] : true;
                node.style("display", symbolsVisible && kindVisible ? "element" : "none");
            });

            cy.edges('edge[type="contains"]').style(
                "display",
                state.showContainsEdges ? "element" : "none"
            );

            cy.edges('edge[type="defines"]').style(
                "display",
                state.showDefinesEdges && symbolsVisible ? "element" : "none"
            );

            cy.edges('edge[type="imports"]').style(
                "display",
                state.showImportsEdges && symbolsVisible ? "element" : "none"
            );

            cy.edges('edge[type="calls"]').style(
                "display",
                state.showCallsEdges && symbolsVisible ? "element" : "none"
            );

            cy.edges('edge[type="extends"]').style(
                "display",
                state.showExtendsEdges && symbolsVisible ? "element" : "none"
            );

            cy.edges('edge[type="implements"]').style(
                "display",
                state.showImplementsEdges && symbolsVisible ? "element" : "none"
            );
        });
    }, []);

    const clearNodeFocus = useCallback((cy: cytoscape.Core) => {
        cy.nodes().forEach(node => {
            node.style('opacity', 1);
            node.removeData('keepLabel');
            if (node.data('type') === 'folder') {
                node.style('border-width', 2);
                node.style('border-color', 'rgba(255,255,255,0.4)');
            } else if (node.data('type') === 'symbol') {
                node.style('border-width', 1);
                node.style('border-color', 'rgba(255,255,255,0.35)');
            } else {
                node.style('border-width', 0);
                node.style('border-color', 'transparent');
            }
            if (isLargeRepo && (node.data('type') === 'file' || node.data('type') === 'symbol')) {
                node.style('label', '');
            }
        });

        cy.edges().forEach(edge => {
            edge.style('opacity', 0.6);
            edge.style('width', 1);
            edge.style('shadow-blur', 0);
            edge.style('shadow-opacity', 0);
        });
    }, [isLargeRepo]);

    const focusNodeNeighborhood = useCallback((cy: cytoscape.Core, node: cytoscape.NodeSingular) => {
        // Dim everything first, then re-highlight connected context.
        cy.nodes().style('opacity', 0.12);
        cy.edges().style('opacity', 0.06);
        cy.nodes().removeData('keepLabel');

        const neighborhood = node.closedNeighborhood();
        neighborhood.nodes().style('opacity', 1);
        neighborhood.edges().style('opacity', 0.92);
        neighborhood.edges().style('width', 2);
        neighborhood.edges().style('shadow-blur', 8);
        neighborhood.edges().style('shadow-opacity', 0.6);
        neighborhood.edges().style('shadow-color', '#93c5fd');

        neighborhood.nodes().forEach(n => {
            n.data('keepLabel', 1);
        });

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

    const handleExplorerFileSelect = useCallback((node: ExplorerNode) => {
        if (node.type !== "file") return;
        setShowExplorer(true);
        setShowExplorerInspector(true);
        setSelectedFile({
            label: node.name,
            path: node.path,
            type: "file",
            extension: node.extension,
            size: node.size,
        });

        const cy = cyRef.current;
        if (!cy) return;
        const cyNode = cy.getElementById(`file:${node.path}`);
        if (cyNode && cyNode.nonempty()) {
            focusNodeNeighborhood(cy, cyNode);
            cy.animate({
                center: { eles: cyNode },
                duration: 300,
                easing: "ease-out-quad",
            });
        }
    }, [focusNodeNeighborhood]);

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
                    selector: 'node[type="symbol"]',
                    style: {
                        'background-color': 'data(color)',
                        'shape': 'ellipse',
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'label': isLargeRepo ? '' : 'data(compactLabel)',
                        'font-size': '9px',
                        'font-family': 'monospace',
                        'text-halign': 'center',
                        'text-valign': 'bottom',
                        'text-margin-y': 8,
                        'border-width': 1,
                        'border-color': 'rgba(255,255,255,0.35)',
                    }
                },
                {
                    selector: 'node[type="symbol"][symbolKind="class"]',
                    style: { 'shape': 'hexagon' }
                },
                {
                    selector: 'node[type="symbol"][symbolKind="interface"]',
                    style: { 'shape': 'round-rectangle' }
                },
                {
                    selector: 'node[type="symbol"][symbolKind="type"]',
                    style: { 'shape': 'diamond' }
                },
                {
                    selector: 'node[type="symbol"][symbolKind="method"]',
                    style: { 'shape': 'triangle' }
                },
                {
                    selector: 'node[type="symbol"][symbolKind="variable"]',
                    style: { 'shape': 'pentagon' }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': '#334155',
                        'opacity': 0.4,
                        'curve-style': 'bezier',
                        'control-point-step-size': 40,
                        'target-arrow-shape': 'none'
                    }
                },
                {
                    selector: 'edge[type="contains"]',
                    style: {
                        'width': 1,
                        'line-color': '#34d399',
                        'opacity': 0.7,
                        'curve-style': 'bezier'
                    }
                },
                {
                    selector: 'edge[type="defines"]',
                    style: {
                        'width': 0.9,
                        'line-color': '#22d3ee',
                        'opacity': 0.7,
                        'curve-style': 'unbundled-bezier',
                        'control-point-distances': [25],
                        'control-point-weights': [0.5],
                    }
                },
                {
                    selector: 'edge[type="imports"]',
                    style: {
                        'width': 1.1,
                        'line-color': '#3b82f6',
                        'opacity': 0.7,
                        'curve-style': 'bezier',
                    }
                },
                {
                    selector: 'edge[type="calls"]',
                    style: {
                        'width': 1.1,
                        'line-color': '#8b5cf6',
                        'opacity': 0.7,
                        'curve-style': 'bezier',
                    }
                },
                {
                    selector: 'edge[type="extends"]',
                    style: {
                        'width': 1.2,
                        'line-color': '#f97316',
                        'opacity': 0.75,
                        'curve-style': 'bezier',
                    }
                },
                {
                    selector: 'edge[type="implements"]',
                    style: {
                        'width': 1.2,
                        'line-color': '#ec4899',
                        'opacity': 0.75,
                        'curve-style': 'bezier',
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
                setSymbolFocus(null);
                setFocusLine(null);
                setShowExplorer(true);
                setShowExplorerInspector(true);
                setSelectedFile({
                    label: data.label,
                    path: data.path,
                    type: "file",
                    extension: data.extension,
                    size: data.rawSize
                });
            } else if (data.type === "symbol" && data.parentPath) {
                const parentPath = String(data.parentPath);
                const fileLabel = parentPath.split("/").pop() || parentPath;
                const ext = fileLabel.includes(".") ? fileLabel.split(".").pop() : undefined;
                setSymbolFocus(String(data.label));
                setFocusLine(null);
                setShowExplorer(true);
                setShowExplorerInspector(true);
                setSelectedFile({
                    label: fileLabel,
                    path: parentPath,
                    type: "file",
                    extension: ext,
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
            if (isLargeRepo && (node.data('type') === 'file' || node.data('type') === 'symbol')) {
                node.style('label', node.data('compactLabel') || node.data('displayLabel') || node.data('label'));
                node.style('font-size', '11px');
                node.style('z-index', 999);
            }
        });

        cy.on('mouseout', 'node', (evt) => {
            if (containerRef.current) containerRef.current.style.cursor = 'default';
            const node = evt.target;
            // Hide label on mouseout for file nodes in large repos
            if (isLargeRepo && (node.data('type') === 'file' || node.data('type') === 'symbol')) {
                if (!node.data('keepLabel')) {
                    node.style('label', '');
                }
                node.style('z-index', 0);
            }
        });

        cyRef.current = cy;
        applyVisibility(cy);

        return () => {
            cy.destroy();
        };
    }, [elements, isLargeRepo, clearNodeFocus, focusNodeNeighborhood, applyVisibility]);

    useEffect(() => {
        visibilityRef.current = {
            showRoot,
            showFolders,
            showFiles,
            showSymbols,
            showContainsEdges,
            showDefinesEdges,
            showImportsEdges,
            showCallsEdges,
            showExtendsEdges,
            showImplementsEdges,
            symbolKindVisibility,
        };
        applyVisibility();
    }, [showRoot, showFolders, showFiles, showSymbols, showContainsEdges, showDefinesEdges, showImportsEdges, showCallsEdges, showExtendsEdges, showImplementsEdges, symbolKindVisibility, applyVisibility]);

    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2);
    const handleFit = () => cyRef.current?.fit(undefined, 50);

    return (
        <div className="relative w-full h-full">
            {/* Top right controls */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                <div className="flex items-center gap-3 px-3 h-8 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300">
                    <span><strong className="text-slate-100">{elements.nodes.length}</strong> nodes</span>
                    <span className="text-slate-600">|</span>
                    <span><strong className="text-slate-100">{elements.edges.length}</strong> edges</span>
                </div>
                <button
                    onClick={() => setShowRightFilters((prev) => !prev)}
                    className={`flex items-center justify-center w-8 h-8 rounded-md border ${showRightFilters ? "bg-slate-800/90 border-slate-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]" : "bg-slate-900/90 border-slate-700 text-slate-300"} hover:text-white`}
                    aria-label="Toggle filters"
                >
                    <Filter className="w-4 h-4" />
                </button>
                <div className="relative flex items-center">
                    <button
                        onClick={() => setShowSearch((prev) => !prev)}
                        className={`flex items-center justify-center w-8 h-8 rounded-md border ${showSearch ? "bg-slate-800/90 border-slate-600 text-white" : "bg-slate-900/90 border-slate-700 text-slate-300"} hover:text-white`}
                        aria-label="Toggle search"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    <div className={`ml-2 overflow-hidden transition-all duration-200 ${showSearch ? "max-w-[140px] opacity-100" : "max-w-0 opacity-0"}`}>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="pl-3 pr-7 h-8 w-[140px] text-xs font-mono bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                            />
                            {searchQuery && (
                                <Button
                                    onClick={() => handleSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {(symbolLoading || symbolError) && (
                <div className="absolute top-14 right-3 z-10 px-3 py-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300">
                    {symbolLoading ? "Analyzing symbols..." : symbolError}
                </div>
            )}

            {/* Right filters drawer */}
            <div className={`absolute top-0 right-0 bottom-0 z-30 transition-transform duration-200 ${showRightFilters ? "translate-x-0" : "translate-x-full"}`}>
                <div className="h-full w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 flex flex-col">
                    <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-700">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Filters</span>
                        <button
                            onClick={() => setShowRightFilters(false)}
                            className="text-slate-400 hover:text-slate-200"
                            aria-label="Close filters"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto px-2.5 py-2.5 text-[10px] font-mono text-slate-300">
                        <button
                            className="w-full flex items-center justify-between rounded px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/60"
                            onClick={() => setNodeFiltersOpen((prev) => !prev)}
                        >
                            <span>Node Types</span>
                            {nodeFiltersOpen ? (
                                <ChevronDown className="w-3 h-3" />
                            ) : (
                                <ChevronRight className="w-3 h-3" />
                            )}
                        </button>
                        {nodeFiltersOpen && (
                            <div className="space-y-1.5 mt-1.5">
                                {[
                                    { key: "root", label: "Root", count: 1, on: showRoot, setOn: setShowRoot, color: "bg-indigo-500" },
                                    { key: "folder", label: "Folder", count: clusterInfo.folders, on: showFolders, setOn: setShowFolders, color: "bg-pink-500" },
                                    { key: "file", label: "File", count: clusterInfo.files, on: showFiles, setOn: setShowFiles, color: "bg-blue-500" },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${item.on ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                        onClick={() => item.setOn((prev: boolean) => !prev)}
                                    >
                                        <span className={`h-2.5 w-2.5 rounded-full ${item.color} shadow-[0_0_8px_rgba(99,102,241,0.35)]`} />
                                        <span className="flex-1 text-left text-slate-200">{item.label}</span>
                                        <span className="text-slate-500">{item.count}</span>
                                        <span className={`ml-1 h-2 w-2 rounded-full ${item.on ? "bg-purple-500" : "bg-slate-700"}`} />
                                    </button>
                                ))}

                                {SYMBOL_KIND_ORDER.map((kind) => {
                                    const count = clusterInfo.symbolTotals.get(kind) || 0;
                                    const on = symbolKindVisibility[kind];
                                    const color = SYMBOL_KIND_STYLE[kind]?.color ?? "#22d3ee";
                                    return (
                                        <button
                                            key={kind}
                                            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${on ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                            onClick={() =>
                                                setSymbolKindVisibility((prev) => ({
                                                    ...prev,
                                                    [kind]: !prev[kind],
                                                }))
                                            }
                                            disabled={!showSymbols}
                                        >
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                            <span className="flex-1 text-left text-slate-200 capitalize">{kind}</span>
                                            <span className="text-slate-500">{count}</span>
                                            <span className={`ml-1 h-2 w-2 rounded-full ${on ? "bg-purple-500" : "bg-slate-700"}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            className="w-full flex items-center justify-between rounded px-2 py-1.5 mt-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/60"
                            onClick={() => setEdgeFiltersOpen((prev) => !prev)}
                        >
                            <span>Edge Types</span>
                            {edgeFiltersOpen ? (
                                <ChevronDown className="w-3 h-3" />
                            ) : (
                                <ChevronRight className="w-3 h-3" />
                            )}
                        </button>
                        {edgeFiltersOpen && (
                            <div className="space-y-1.5 mt-1.5">
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showContainsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowContainsEdges((prev) => !prev)}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-emerald-400" />
                                    <span className="flex-1 text-left text-slate-200">Contains</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showContainsEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showDefinesEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowDefinesEdges((prev) => !prev)}
                                    disabled={!showSymbols}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-cyan-400" />
                                    <span className="flex-1 text-left text-slate-200">Defines</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showDefinesEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showImportsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowImportsEdges((prev) => !prev)}
                                    disabled={!showSymbols}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-blue-500" />
                                    <span className="flex-1 text-left text-slate-200">Imports</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showImportsEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showCallsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowCallsEdges((prev) => !prev)}
                                    disabled={!showSymbols}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-violet-500" />
                                    <span className="flex-1 text-left text-slate-200">Calls</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showCallsEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showExtendsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowExtendsEdges((prev) => !prev)}
                                    disabled={!showSymbols}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-orange-500" />
                                    <span className="flex-1 text-left text-slate-200">Extends</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showExtendsEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                                <button
                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showImplementsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                    onClick={() => setShowImplementsEdges((prev) => !prev)}
                                    disabled={!showSymbols}
                                >
                                    <span className="h-1.5 w-7 rounded-full bg-pink-500" />
                                    <span className="flex-1 text-left text-slate-200">Implements</span>
                                    <span className={`ml-1 h-2 w-2 rounded-full ${showImplementsEdges ? "bg-purple-500" : "bg-slate-700"}`} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* File Explorer Panel */}
            <div className={`absolute top-0 bottom-0 left-0 z-20 transition-transform duration-200 ${showExplorer ? "translate-x-0" : "-translate-x-full"}`}>
                <div
                    className="h-full bg-slate-900/95 backdrop-blur border-r border-slate-700 flex flex-col"
                    style={{ width: explorerWidth }}
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Explorer</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowExplorerInspector((prev) => !prev)}
                                className="text-slate-400 hover:text-slate-200"
                                aria-label="Toggle code inspector"
                                title="Toggle code inspector"
                            >
                                {showExplorerInspector ? (
                                    <ChevronRight className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
                                )}
                            </button>
                            <button
                                onClick={() => setShowExplorer(false)}
                                className="text-slate-400 hover:text-slate-200"
                                aria-label="Hide explorer"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto px-2 py-2 text-[11px] font-mono text-slate-300">
                        {(() => {
                            const renderNode = (node: ExplorerNode, depth: number) => {
                                const isFolder = node.type === "folder";
                                const isExpanded = expandedFolders.has(node.path);
                                const hasChildren = node.children && node.children.length > 0;
                                return (
                                    <div key={node.path || "root"}>
                                        <button
                                            className="w-full flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-slate-800/70"
                                            style={{ paddingLeft: 6 + depth * 12 }}
                                            onClick={() => {
                                                if (isFolder) {
                                                    toggleFolder(node.path);
                                                } else {
                                                    handleExplorerFileSelect(node);
                                                }
                                            }}
                                        >
                                            {isFolder ? (
                                                hasChildren ? (
                                                    isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />
                                                ) : (
                                                    <span className="w-3 h-3" />
                                                )
                                            ) : (
                                                <span className="w-3 h-3" />
                                            )}
                                            {isFolder ? (
                                                <Folder className="w-3.5 h-3.5" style={{ color: "#f472b6" }} />
                                            ) : (
                                                <File className="w-3.5 h-3.5" style={{ color: getFileColor(node.name) }} />
                                            )}
                                            <span className="truncate text-left">{node.name}</span>
                                        </button>
                                        {isFolder && isExpanded && hasChildren && (
                                            <div>
                                                {node.children!.map((child) => renderNode(child, depth + 1))}
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            return renderNode(explorerTree, 0);
                        })()}
                    </div>
                </div>
                <div
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent"
                    onMouseDown={() => {
                        resizingRef.current = true;
                    }}
                />
            </div>

            {/* Explorer Inspector Pane */}
            {showExplorer && (
                <div
                    className={`absolute top-0 bottom-0 z-20 transition-transform duration-200 ${showExplorerInspector ? "translate-x-0" : "-translate-x-full"}`}
                    style={{ left: explorerWidth, width: inspectorWidth }}
                >
                    <div className="h-full bg-[#0a0e1a]/95 backdrop-blur-xl border-r border-border/30 flex flex-col">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Inspector</span>
                                <span className="text-[11px] font-semibold truncate">
                                    {selectedFile?.label ?? "No file selected"}
                                </span>
                                {selectedFile?.extension && (
                                    <Badge
                                        variant="outline"
                                        className="text-[9px] shrink-0"
                                        style={{ borderColor: getFileColor(selectedFile.label) + "40", color: getFileColor(selectedFile.label) }}
                                    >
                                        .{selectedFile.extension}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                {selectedFile && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-6 h-6 shrink-0"
                                        onClick={() => setSelectedFile(null)}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6 shrink-0"
                                    onClick={() => setShowExplorerInspector(false)}
                                >
                                    <PanelLeftClose className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {selectedFile && (
                            <div className="px-3 py-2 border-b border-border/20 text-[10px] text-muted-foreground space-y-1">
                                <div className="truncate">
                                    <span className="font-medium text-foreground/80">Path:</span> {selectedFile.path}
                                </div>
                                {selectedFile.size !== undefined && (
                                    <div>
                                        <span className="font-medium text-foreground/80">Size:</span> {formatBytes(selectedFile.size)}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex-1 overflow-auto" ref={codeScrollRef}>
                            {fileLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center">
                                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                        <p className="text-[10px] text-muted-foreground">Loading file...</p>
                                    </div>
                                </div>
                            ) : fileError ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center px-4">
                                        <p className="text-[10px] text-muted-foreground">{fileError}</p>
                                    </div>
                                </div>
                            ) : fileContent !== null && selectedFile ? (
                                <pre className="text-[10px] leading-[1.55] font-mono" style={{ background: "transparent" }}>
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
                                                <div
                                                    key={i}
                                                    data-line={i + 1}
                                                    className={`flex group transition-colors duration-300 ${focusLine === i + 1 ? "bg-indigo-500/15 border-l-2 border-indigo-400/70" : "hover:bg-white/[0.03]"}`}
                                                >
                                                    <span className="inline-block w-10 text-right pr-3 text-muted-foreground/40 select-none shrink-0 group-hover:text-muted-foreground/60">
                                                        {i + 1}
                                                    </span>
                                                    {highlighted ? (
                                                        <span
                                                            className="flex-1 whitespace-pre pr-3 break-all"
                                                            dangerouslySetInnerHTML={{ __html: line || " " }}
                                                        />
                                                    ) : (
                                                        <span className="flex-1 text-slate-300 whitespace-pre pr-3 break-all">
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
                                    <p className="text-[10px] text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!showExplorer && (
                <button
                    onClick={() => setShowExplorer(true)}
                    className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2 py-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300 hover:text-white"
                >
                    <PanelLeftOpen className="w-4 h-4" />
                    Explorer
                </button>
            )}

            {/* Cytoscape Container */}
            <div ref={containerRef} className="w-full h-full min-h-[800px] bg-slate-950 rounded-xl" />

            {/* Controls overlay */}
            <div
                className="absolute bottom-4 z-10 flex flex-col gap-2"
                style={{ left: showExplorer ? explorerWidth + (showExplorerInspector ? inspectorWidth : 0) + 16 : 16 }}
            >
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

        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
