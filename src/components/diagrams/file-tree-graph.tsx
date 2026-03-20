"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import cytoscape from "cytoscape";
import { List, type RowComponentProps } from "react-window";
// @ts-expect-error fcose is an extension package without bundled TS types.
import fcose from "cytoscape-fcose";
import { getFileColor } from "@/lib/file-icons";
import { buildSymbolGraph, isAnalyzableCodeFile, type SymbolKind } from "@/lib/symbol-parser";
import type { TreeItem, FileNodeData } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut, Search, X, ChevronDown, ChevronRight, Folder, File, Filter, Braces, FileCode2, FileJson2, FileText, FileType2, FolderOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
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
    fileTypeLegend?: Array<{ ext: string; count: number; color: string }>;
}

interface ExplorerNode {
    name: string;
    path: string;
    type: "folder" | "file";
    children?: ExplorerNode[];
    size?: number;
    extension?: string;
}

interface FlatExplorerRow {
    path: string;
    name: string;
    depth: number;
    type: "folder" | "file";
    hasChildren: boolean;
    isExpanded: boolean;
    extension?: string;
    size?: number;
}

interface CodeLineRow {
    lineNumber: number;
    raw: string;
    html: string | null;
    indentLevel: number;
}

const EXPLORER_ROW_HEIGHT = 30;
const EXPLORER_SCROLL_STORAGE_PREFIX = "gitviz_explorer_scroll";
const EXPLORER_EXPANDED_STORAGE_PREFIX = "gitviz_explorer_expanded";
const CODE_ROW_HEIGHT = 24;

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
const BINARY_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp",
    "mp4", "webm", "mp3", "wav", "ogg",
    "zip", "tar", "gz", "rar", "7z",
    "pdf", "doc", "docx", "xls", "xlsx",
    "woff", "woff2", "ttf", "eot", "otf",
    "exe", "dll", "so", "dylib",
    "lock",
]);

export default function FileTreeGraph({ tree, owner, repo, fileTypeLegend = [] }: FileTreeGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const symbolCacheRef = useRef(new Map<string, string>());
    const codePanelRef = useRef<HTMLDivElement>(null);
    const codeListRef = useRef<{
        element: HTMLDivElement | null;
        scrollToRow: (config: { index: number; align?: "auto" | "center" | "end" | "smart" | "start"; behavior?: "auto" | "instant" | "smooth" }) => void;
    } | null>(null);
    const [selectedFile, setSelectedFile] = useState<FileNodeData | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [symbolFocus, setSymbolFocus] = useState<string | null>(null);
    const [focusLine, setFocusLine] = useState<number | null>(null);
    const [activeLine, setActiveLine] = useState(1);
    const [codeViewportHeight, setCodeViewportHeight] = useState(520);
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
    const [showExplorer] = useState(true);
    const [showExplorerInspector, setShowExplorerInspector] = useState(false);
    const [explorerWidth, setExplorerWidth] = useState(220);
    const [explorerViewportHeight, setExplorerViewportHeight] = useState(560);
    const [showRightFilters, setShowRightFilters] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [nodeFiltersOpen, setNodeFiltersOpen] = useState(true);
    const [symbolFiltersOpen, setSymbolFiltersOpen] = useState(true);
    const [edgeFiltersOpen, setEdgeFiltersOpen] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set([""]));
    const [treeFocusPath, setTreeFocusPath] = useState<string>("");
    const [explorerScrollOffset, setExplorerScrollOffset] = useState(0);
    const resizingRef = useRef(false);
    const explorerWidthRef = useRef(220);
    const explorerBodyRef = useRef<HTMLDivElement>(null);
    const explorerListRef = useRef<{
        element: HTMLDivElement | null;
        scrollToRow: (config: { index: number; align?: "auto" | "center" | "end" | "smart" | "start"; behavior?: "auto" | "instant" | "smooth" }) => void;
    } | null>(null);
    const [symbolGraph, setSymbolGraph] = useState<ReturnType<typeof buildSymbolGraph>>({
        symbols: [],
        references: [],
    });
    const inspectorWidth = 440;
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

    const explorerRows = useMemo<FlatExplorerRow[]>(() => {
        const rows: FlatExplorerRow[] = [];

        const walk = (node: ExplorerNode, depth: number) => {
            const hasChildren = Boolean(node.children && node.children.length > 0);
            const isExpanded = node.type === "folder" ? expandedFolders.has(node.path) : false;
            rows.push({
                path: node.path,
                name: node.name,
                depth,
                type: node.type,
                hasChildren,
                isExpanded,
                extension: node.extension,
                size: node.size,
            });

            if (node.type === "folder" && hasChildren && isExpanded) {
                node.children!.forEach((child) => walk(child, depth + 1));
            }
        };

        walk(explorerTree, 0);
        return rows;
    }, [expandedFolders, explorerTree]);

    const explorerRowIndexByPath = useMemo(() => {
        const map = new Map<string, number>();
        explorerRows.forEach((row, index) => {
            map.set(row.path, index);
        });
        return map;
    }, [explorerRows]);

    const repoScopedExpandedKey = `${EXPLORER_EXPANDED_STORAGE_PREFIX}:${owner}/${repo}`;
    const repoScopedScrollKey = `${EXPLORER_SCROLL_STORAGE_PREFIX}:${owner}/${repo}`;

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const rawExpanded = localStorage.getItem(repoScopedExpandedKey);
            if (rawExpanded) {
                const parsed = JSON.parse(rawExpanded) as string[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setExpandedFolders(new Set(parsed));
                }
            }
            const rawScroll = localStorage.getItem(repoScopedScrollKey);
            if (rawScroll) {
                const parsedOffset = Number(rawScroll);
                if (Number.isFinite(parsedOffset)) {
                    setExplorerScrollOffset(parsedOffset);
                }
            }
        } catch {
            // Ignore persisted UI state parsing issues.
        }
    }, [repoScopedExpandedKey, repoScopedScrollKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        localStorage.setItem(repoScopedExpandedKey, JSON.stringify(Array.from(expandedFolders)));
    }, [expandedFolders, repoScopedExpandedKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        localStorage.setItem(repoScopedScrollKey, String(explorerScrollOffset));
    }, [explorerScrollOffset, repoScopedScrollKey]);

    useEffect(() => {
        if (!showExplorer || !explorerBodyRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const [entry] = entries;
            if (!entry) return;
            const nextHeight = Math.max(180, Math.floor(entry.contentRect.height));
            setExplorerViewportHeight(nextHeight);
        });
        observer.observe(explorerBodyRef.current);
        return () => observer.disconnect();
    }, [showExplorer]);

    useEffect(() => {
        if (!showExplorer) return;
        const element = explorerListRef.current?.element;
        if (!element) return;
        element.scrollTop = explorerScrollOffset;
    }, [showExplorer, explorerScrollOffset]);

    useEffect(() => {
        explorerWidthRef.current = explorerWidth;
    }, [explorerWidth]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (!resizingRef.current) return;
            const nextWidth = Math.min(360, Math.max(180, event.clientX));
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
        } catch {
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

    const highlightedLines = useMemo<CodeLineRow[]>(() => {
        if (!fileContent) return [];
        const ext = selectedFile?.extension?.toLowerCase() ?? "";
        const lang = extToPrismLang[ext];
        const grammar = lang ? Prism.languages[lang] : null;
        const rawLines = fileContent.split("\n");
        const highlighted = grammar ? Prism.highlight(fileContent, grammar, lang).split("\n") : [];

        return rawLines.map((raw, index) => {
            const leadingWhitespace = raw.match(/^[\t ]+/)?.[0] ?? "";
            const spaces = leadingWhitespace.replace(/\t/g, "    ").length;
            return {
                lineNumber: index + 1,
                raw,
                html: grammar ? (highlighted[index] ?? "") : null,
                indentLevel: Math.min(10, Math.floor(spaces / 4)),
            };
        });
    }, [fileContent, selectedFile?.extension]);

    useEffect(() => {
        if (!showExplorerInspector || !codePanelRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const [entry] = entries;
            if (!entry) return;
            setCodeViewportHeight(Math.max(220, Math.floor(entry.contentRect.height)));
        });
        observer.observe(codePanelRef.current);
        return () => observer.disconnect();
    }, [showExplorerInspector]);

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
        if (!focusLine) return;
        setActiveLine(focusLine);
    }, [focusLine]);

    useEffect(() => {
        if (!highlightedLines.length) return;
        const bounded = Math.min(Math.max(activeLine, 1), highlightedLines.length);
        if (bounded !== activeLine) {
            setActiveLine(bounded);
            return;
        }
        codeListRef.current?.scrollToRow({
            index: bounded - 1,
            align: "smart",
            behavior: "auto",
        });
    }, [activeLine, highlightedLines.length]);

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
        const nodes: cytoscape.NodeDefinition[] = [];
        const edges: cytoscape.EdgeDefinition[] = [];
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

        const getDisplayLabel = (label: string) => {
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
            const displayLabel = getDisplayLabel(label);
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
            const nodeIdSet = new Set<string>(
                nodes
                    .map((node) => (node.data as { id?: string } | undefined)?.id)
                    .filter((id): id is string => Boolean(id))
            );
            const edgeIdSet = new Set<string>(
                edges
                    .map((edge) => (edge.data as { id?: string } | undefined)?.id)
                    .filter((id): id is string => Boolean(id))
            );
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
        const folders = elements.nodes.filter((n) => n.data && (n.data as Record<string, unknown>).type === "folder").length;
        const files = elements.nodes.filter((n) => n.data && (n.data as Record<string, unknown>).type === "file").length;
        const symbols = elements.nodes.filter((n) => n.data && (n.data as Record<string, unknown>).type === "symbol").length;
        const symbolRefs = elements.edges.filter((e) => e.data && ["imports", "calls", "extends", "implements"].includes(String((e.data as Record<string, unknown>).type ?? ""))).length;
        const symbolKinds = new Map<string, number>();
        const symbolTotals = new Map<string, number>();
        const edgeTypeCounts = new Map<string, number>();
        // Count unique extensions
        const extMap = new Map<string, number>();
        elements.nodes.forEach((n) => {
            const data = (n.data ?? {}) as Record<string, unknown>;
            const extension = typeof data.extension === "string" ? data.extension : null;
            if (extension) {
                extMap.set(extension, (extMap.get(extension) || 0) + 1);
            }
            if (data.type === "symbol" && data.symbolKind) {
                const kind = String(data.symbolKind);
                symbolKinds.set(kind, (symbolKinds.get(kind) || 0) + 1);
            }
        });
        elements.edges.forEach((edge) => {
            const data = (edge.data ?? {}) as Record<string, unknown>;
            const type = typeof data.type === "string" ? data.type : null;
            if (type) {
                edgeTypeCounts.set(type, (edgeTypeCounts.get(type) || 0) + 1);
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
        return { folders, files, symbols, symbolRefs, topExtensions, symbolKinds, symbolTotals, edgeTypeCounts };
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

    const expandParentFolders = useCallback((path: string) => {
        const parts = path.split("/");
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            next.add("");
            for (let index = 1; index < parts.length; index += 1) {
                next.add(parts.slice(0, index).join("/"));
            }
            return next;
        });
    }, []);

    const focusExplorerPath = useCallback((path: string) => {
        setTreeFocusPath(path);
        const nextIndex = explorerRowIndexByPath.get(path);
        if (nextIndex !== undefined) {
            explorerListRef.current?.scrollToRow({ index: nextIndex, align: "smart", behavior: "auto" });
        }
    }, [explorerRowIndexByPath]);

    const handleExplorerFileSelect = useCallback((node: { name: string; path: string; extension?: string; size?: number }) => {
        expandParentFolders(node.path);
        setTreeFocusPath(node.path);
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
    }, [expandParentFolders, focusNodeNeighborhood]);

    const handleExplorerKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!showExplorer || explorerRows.length === 0) return;

        const activePath = treeFocusPath || selectedFile?.path || "";
        const activeIndex = explorerRowIndexByPath.get(activePath) ?? 0;
        const activeRow = explorerRows[activeIndex];

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const nextIndex = Math.min(explorerRows.length - 1, activeIndex + 1);
            focusExplorerPath(explorerRows[nextIndex].path);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            const nextIndex = Math.max(0, activeIndex - 1);
            focusExplorerPath(explorerRows[nextIndex].path);
            return;
        }

        if (!activeRow) return;

        if (event.key === "ArrowRight") {
            event.preventDefault();
            if (activeRow.type === "folder") {
                if (!activeRow.isExpanded) {
                    toggleFolder(activeRow.path);
                    return;
                }
                const childIndex = activeIndex + 1;
                if (explorerRows[childIndex]?.depth === activeRow.depth + 1) {
                    focusExplorerPath(explorerRows[childIndex].path);
                }
            }
            return;
        }

        if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (activeRow.type === "folder" && activeRow.isExpanded) {
                toggleFolder(activeRow.path);
                return;
            }
            const parentPath = getParentPath(activeRow.path);
            if (parentPath !== null && explorerRowIndexByPath.has(parentPath)) {
                focusExplorerPath(parentPath);
            }
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (activeRow.type === "folder") {
                toggleFolder(activeRow.path);
            } else {
                handleExplorerFileSelect({
                    name: activeRow.name,
                    path: activeRow.path,
                    extension: activeRow.extension,
                    size: activeRow.size,
                });
            }
        }
    }, [showExplorer, explorerRows, treeFocusPath, selectedFile?.path, explorerRowIndexByPath, focusExplorerPath, toggleFolder, handleExplorerFileSelect]);

    useEffect(() => {
        if (!selectedFile?.path) return;
        expandParentFolders(selectedFile.path);
        setTreeFocusPath(selectedFile.path);
    }, [selectedFile?.path, expandParentFolders]);

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
                animationDuration: 500,
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
            } as unknown as cytoscape.LayoutOptions,
            wheelSensitivity: 0.2,
        });

        // Add event listeners
        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const data = node.data();

            focusNodeNeighborhood(cy, node);

            if (data.type === "file") {
                setSymbolFocus(null);
                setFocusLine(null);
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
        <div className="relative w-full h-full min-h-[800px] flex bg-black diagram-grid" style={{ background: '#000000ff' }}>
            <div
                className="relative z-30 overflow-visible h-full shrink-0 border-r border-slate-700/80 bg-slate-950/95 backdrop-blur flex"
                style={{ width: explorerWidth  }}
            >
                <div className="h-full border-r border-slate-700 flex flex-col" style={{ width: explorerWidth }}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                        <span className="ui-eyebrow text-slate-400">Explorer</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowExplorerInspector((prev) => !prev)}
                            className="h-7 w-7 text-slate-400 hover:text-slate-200"
                            aria-label={showExplorerInspector ? "Hide inspector" : "Show inspector"}
                        >
                            {showExplorerInspector ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
                        </Button>
                    </div>
                    <div className="relative flex-1 overflow-x-auto overflow-y-hidden ui-body font-mono text-slate-200" ref={explorerBodyRef} tabIndex={0} onKeyDown={handleExplorerKeyboard}>
                        <List
                            listRef={explorerListRef}
                            style={{ height: explorerViewportHeight, width: Math.max(180, explorerWidth) }}
                            rowCount={explorerRows.length}
                            rowHeight={EXPLORER_ROW_HEIGHT}
                            overscanCount={10}
                            rowComponent={({ index, style, ariaAttributes, rows }: RowComponentProps<{ rows: FlatExplorerRow[] }>) => {
                                const row = rows[index];
                                const isFolder = row.type === "folder";
                                const isSelected = selectedFile?.path === row.path;
                                const isFocused = treeFocusPath === row.path;
                                const iconColor = isFolder ? "#f472b6" : getFileColor(row.name);
                                return (
                                    <div style={style} key={row.path || "root"} className="px-1.5 py-0.5" {...ariaAttributes}>
                                        <button
                                            className={`group relative w-full h-[28px] flex items-center gap-1.5 rounded-md border transition-colors duration-150 ${isSelected ? "bg-indigo-500/20 border-indigo-400/50 text-white shadow-[inset_2px_0_0_0_#818cf8]" : "border-transparent text-slate-300 hover:bg-slate-800/75 hover:text-slate-100"} ${isFocused && !isSelected ? "ring-1 ring-slate-500/70" : ""}`}
                                            style={{ paddingLeft: 6 + row.depth * 14 }}
                                            onClick={() => {
                                                setTreeFocusPath(row.path);
                                                if (isFolder) {
                                                    toggleFolder(row.path);
                                                } else {
                                                    handleExplorerFileSelect({ name: row.name, path: row.path, extension: row.extension, size: row.size });
                                                }
                                            }}
                                        >
                                            {Array.from({ length: row.depth }).map((_, guideIdx) => (
                                                <span key={`${row.path}-guide-${guideIdx}`} className="absolute top-1 bottom-1 bg-slate-600/50" style={{ left: 12 + guideIdx * 14, width: '1.5px' }} />
                                            ))}
                                            {isFolder ? (
                                                row.hasChildren ? <span className={`shrink-0 transition-transform duration-150 ${row.isExpanded ? "rotate-90" : "rotate-0"}`}><ChevronRight className="shrink-0 w-3 h-3 text-slate-400" /></span> : <span className="shrink-0 w-3 h-3" />
                                            ) : <span className="shrink-0 w-3 h-3" />}
                                            <div className="shrink-0 flex items-center justify-center">
                                                {isFolder ? (row.isExpanded ? <FolderOpen className="w-3.5 h-3.5" style={{ color: iconColor }} /> : <Folder className="w-3.5 h-3.5" style={{ color: iconColor }} />) : getExplorerFileIcon(row.name)}
                                            </div>
                                            <span className="truncate text-left min-w-0" title={row.path || row.name || repo}>{row.name || repo}</span>
                                        </button>
                                    </div>
                                );
                            }}
                            rowProps={{ rows: explorerRows }}
                            onResize={(size) => setExplorerViewportHeight(Math.max(180, Math.floor(size.height)))}
                            onScroll={(event) => {
                                const target = event.currentTarget;
                                if (target instanceof HTMLDivElement) setExplorerScrollOffset(target.scrollTop);
                            }}
                        />
                    </div>
                </div>

                <div
                    className="h-full w-2 cursor-col-resize flex flex-col items-center justify-center gap-1 group hover:bg-slate-700/40 transition-colors"
                    onMouseDown={() => { resizingRef.current = true; }}
                >
                    <span className="w-0.5 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
                    <span className="w-0.5 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
                    <span className="w-0.5 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
                </div>

                <motion.div
                    className="absolute left-full top-0 h-full z-40 overflow-hidden"
                    initial={false}
                    animate={{
                        width: showExplorerInspector ? inspectorWidth : 0,
                        opacity: showExplorerInspector ? 1 : 0,
                    }}
                    transition={{
                        width: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.3, ease: "easeInOut" },
                    }}
                >
                    <div style={{ width: inspectorWidth }} className="h-full">
                    <div className="h-full bg-[#070b15]/95 backdrop-blur-xl border-r border-border/30 flex flex-col">
                        <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0b1020]/95">
                            <div className="flex items-center justify-between px-3 py-2.5">
                                <div className="min-w-0 flex items-center gap-1.5">
                                    <span className="ui-eyebrow text-slate-400">Code Inspector</span>
                                    <span className="ui-body font-semibold text-slate-100 truncate">{selectedFile?.label ?? ""}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-400 hover:text-slate-200"
                                    onClick={() => setShowExplorerInspector(false)}
                                    aria-label="Collapse inspector"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 flex">
                            <div className="flex-1 min-w-0 border-r border-slate-800/80 overflow-x-auto" ref={codePanelRef}>
                                {fileLoading ? (
                                    <div className="flex items-center justify-center h-full"><p className="ui-body text-slate-400">Loading file...</p></div>
                                ) : fileError ? (
                                    <div className="flex items-center justify-center h-full"><p className="ui-body text-slate-400 px-4 text-center">{fileError}</p></div>
                                ) : fileContent !== null && selectedFile ? (
                                    <List
                                        listRef={codeListRef}
                                        style={{ height: codeViewportHeight, width: "100%" }}
                                        rowCount={highlightedLines.length}
                                        rowHeight={CODE_ROW_HEIGHT}
                                        overscanCount={14}
                                        rowProps={{ rows: highlightedLines, activeLine, onLineSelect: (lineNumber: number) => setActiveLine(lineNumber) }}
                                        rowComponent={({ index, style, ariaAttributes, rows, activeLine: currentActiveLine, onLineSelect }: RowComponentProps<{ rows: CodeLineRow[]; activeLine: number; onLineSelect: (lineNumber: number) => void }>) => {
                                            const line = rows[index];
                                            const isActive = currentActiveLine === line.lineNumber;
                                            return (
                                                <button type="button" style={style} {...ariaAttributes} onClick={() => onLineSelect(line.lineNumber)} className={`group relative min-w-full w-max flex items-center text-left font-mono text-[13px] leading-[1.62] ${isActive ? "bg-indigo-500/14" : "hover:bg-slate-800/40"}`}>
                                                    <span className={`w-14 shrink-0 select-none text-right pr-3 border-r border-slate-800/70 ${isActive ? "text-indigo-200" : "text-slate-500 group-hover:text-slate-400"}`}>{line.lineNumber}</span>
                                                    <span className="relative px-3 whitespace-pre text-left">
                                                        {line.html ? <span className="relative z-[1] inline-block" dangerouslySetInnerHTML={{ __html: line.html || " " }} /> : <span className="relative z-[1] inline-block text-slate-200">{line.raw || " "}</span>}
                                                    </span>
                                                </button>
                                            );
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full"><div className="ui-body text-slate-500">Select a file to inspect</div></div>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </motion.div>
            </div>

            <div className="relative flex-1 h-full">
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                    <div className="flex items-center gap-1 px-3 h-8 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-[11px] font-mono text-slate-300">
                        <span><strong className="text-slate-100">{elements.nodes.length}</strong> nodes</span>
                        <span className="text-slate-600">|</span>
                        <span><strong className="text-slate-100">{elements.edges.length}</strong> edges</span>
                    </div>
                    <div className="relative flex items-center">
                        <button
                            onClick={() => setShowSearch((prev) => !prev)}
                            className={`flex items-center justify-center w-8 h-8 rounded-md border ${showSearch ? "bg-slate-800/90 border-slate-600 text-white" : "bg-slate-900/90 border-slate-700 text-slate-300"} hover:text-white`}
                            aria-label="Toggle search"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                        <div className={`${showSearch ? "ml-2 max-w-[180px] opacity-100" : "ml-0 max-w-0 opacity-0"} overflow-hidden transition-all duration-500`}>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search graph"
                                    value={searchQuery}
                                    onChange={(event) => handleSearch(event.target.value)}
                                    className="pl-3 pr-7 h-8 w-[180px] text-xs font-mono bg-slate-900/90 backdrop-blur border border-slate-700 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
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
                    <button onClick={() => setShowRightFilters((prev) => !prev)} className={`flex items-center justify-center w-8 h-8 rounded-md border ${showRightFilters ? "bg-slate-800/90 border-slate-600 text-white" : "bg-slate-900/90 border-slate-700 text-slate-300"} hover:text-white`} aria-label="Toggle filters"><Filter className="w-4 h-4" /></button>
                </div>

                <div className={`absolute top-0 right-0 bottom-0 z-20 transition-transform duration-900 ${showRightFilters ? "translate-x-0" : "translate-x-full"}`}>
                    <div className="h-full w-55 bg-slate-900/95 backdrop-blur border-l border-slate-900 flex flex-col">
                        <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800">
                            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Filters</span>
                            <button onClick={() => setShowRightFilters(false)} className="text-slate-400 hover:text-slate-200" aria-label="Close filters">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto px-2.5 py-2.5 text-[10px] font-mono text-slate-300 space-y-3">
                            <div>
                                <button className="w-full flex items-center justify-between rounded px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/60" onClick={() => setNodeFiltersOpen((prev) => !prev)}>
                                    <span>Node Types</span>
                                    {nodeFiltersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                                {nodeFiltersOpen && (
                                    <div className="space-y-1.5 mt-1.5">
                                        {[
                                            { key: "root", label: "Root", count: 1, on: showRoot, setOn: setShowRoot, color: "bg-indigo-500" },
                                            { key: "folder", label: "Folder", count: clusterInfo.folders, on: showFolders, setOn: setShowFolders, color: "bg-pink-500" },
                                            { key: "file", label: "File", count: clusterInfo.files, on: showFiles, setOn: setShowFiles, color: "bg-blue-500" },
                                        ].map((item) => (
                                            <button key={item.key} className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${item.on ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => item.setOn((prev: boolean) => !prev)}>
                                                <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                                                <span className="flex-1 text-left text-slate-200">{item.label}</span>
                                                <span className="text-slate-500">{item.count}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <button className="w-full flex items-center justify-between rounded px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/60" onClick={() => setSymbolFiltersOpen((prev) => !prev)}>
                                    <span>Symbol Types</span>
                                    {symbolFiltersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                                {symbolFiltersOpen && (
                                    <div className="space-y-1.5 mt-1.5">
                                        
                                        {SYMBOL_KIND_ORDER.map((kind) => {
                                            const active = symbolKindVisibility[kind];
                                            const kindColor = SYMBOL_KIND_STYLE[kind]?.color ?? "#94a3b8";
                                            const visibleCount = clusterInfo.symbolKinds.get(kind) ?? 0;
                                            const totalCount = clusterInfo.symbolTotals.get(kind) ?? visibleCount;
                                            return (
                                                <button
                                                    key={kind}
                                                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${active ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`}
                                                    onClick={() => setSymbolKindVisibility((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                                                >
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kindColor }} />
                                                    <span className="flex-1 text-left text-slate-200 capitalize">{kind}</span>
                                                    <span className="text-slate-500">{totalCount}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <button className="w-full flex items-center justify-between rounded px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/60" onClick={() => setEdgeFiltersOpen((prev) => !prev)}>
                                    <span>Edge Types</span>
                                    {edgeFiltersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                                {edgeFiltersOpen && (
                                    <div className="space-y-1.5 mt-1.5">
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showContainsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowContainsEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-emerald-400" /><span className="flex-1 text-left text-slate-200">Contains</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("contains") ?? 0}</span></button>
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showDefinesEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowDefinesEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-cyan-400" /><span className="flex-1 text-left text-slate-200">Defines</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("defines") ?? 0}</span></button>
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showImportsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowImportsEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-blue-500" /><span className="flex-1 text-left text-slate-200">Imports</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("imports") ?? 0}</span></button>
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showCallsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowCallsEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-violet-500" /><span className="flex-1 text-left text-slate-200">Calls</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("calls") ?? 0}</span></button>
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showExtendsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowExtendsEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-fuchsia-500" /><span className="flex-1 text-left text-slate-200">Extends</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("extends") ?? 0}</span></button>
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showImplementsEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowImplementsEdges((prev) => !prev)}><span className="h-1.5 w-7 rounded-full bg-rose-500" /><span className="flex-1 text-left text-slate-200">Implements</span><span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("implements") ?? 0}</span></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {fileTypeLegend.length > 0 && (
                    <div className="absolute bottom-4 left-2 z-20 w-32 rounded-md border border-slate-700 bg-slate-900/90 backdrop-blur p-2">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">File Types</div>
                        <div className="space-y-1">
                            {fileTypeLegend.map(({ ext, count, color }) => (
                                <div key={ext} className="flex items-center gap-1.5 text-[10px]">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-slate-300 truncate">.{ext}</span>
                                    <span className="ml-auto text-slate-500">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={containerRef} className="w-full h-full min-h-[800px] rounded-xl" />

                <div className="absolute bottom-8 right-4 z-10 rounded-md border border-slate-700 bg-slate-900/90 backdrop-blur p-1.5 flex flex-col gap-1.5">
                    <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-800/80 border border-slate-600 hover:bg-slate-700" onClick={handleZoomIn}><ZoomIn className="w-4 h-4" /></Button>
                    <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-800/80 border border-slate-600 hover:bg-slate-700" onClick={handleZoomOut}><ZoomOut className="w-4 h-4" /></Button>
                    <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-800/80 border border-slate-600 hover:bg-slate-700" onClick={handleFit}><Maximize2 className="w-4 h-4" /></Button>
                </div>
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getParentPath(path: string): string | null {
    if (!path) return null;
    const parts = path.split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
}

function getExplorerFileIcon(fileName: string) {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(extension)) {
        return <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (["json", "jsonc", "yaml", "yml"].includes(extension)) {
        return <FileJson2 className="w-3.5 h-3.5 text-amber-300" />;
    }
    if (["md", "txt", "rst", "adoc"].includes(extension)) {
        return <FileText className="w-3.5 h-3.5 text-slate-300" />;
    }
    if (["html", "css", "scss", "xml", "svg"].includes(extension)) {
        return <FileType2 className="w-3.5 h-3.5 text-pink-300" />;
    }
    if (["py", "go", "rs", "java", "c", "cpp", "h", "hpp", "rb", "php"].includes(extension)) {
        return <Braces className="w-3.5 h-3.5 text-emerald-300" />;
    }
    return <File className="w-3.5 h-3.5" style={{ color: getFileColor(fileName) }} />;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
