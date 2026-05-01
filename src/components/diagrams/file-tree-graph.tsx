"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion } from "framer-motion";
import Graph from "graphology";
import type Sigma from "sigma";
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { List, type RowComponentProps } from "react-window";
import { getFileColor } from "@/lib/file-icons";
import { selectSymbolAnalysisFiles, isImportableCodeFile, type FileImportEdge, type SymbolKind } from "@/lib/symbol-parser";
import type { TreeItem, FileNodeData } from "@/types";
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

interface SymbolDiagnostics {
    totalBlobCount: number;
    candidateCount: number;
    selectedCount: number;
    skippedByLimit: number;
    skippedBySize: number;
    skippedNotAnalyzable: number;
    fetchAttempted: number;
    fetchSucceeded: number;
    cacheHits: number;
    fetchFailed: number;
    largeRepo: boolean;
    limit: number;
}

interface SimNode {
    id: string;
    type: "root" | "folder" | "file" | "symbol";
    radius: number;
    label: string;
    ext?: string;
    showLabel?: number;
    symbolKind?: SymbolKind;
    parentPath?: string;
    path?: string;
    rawSize?: number;
    hubScore?: number;
}

const EXPLORER_ROW_HEIGHT = 30;
const EXPLORER_SCROLL_STORAGE_PREFIX = "gitviz_explorer_scroll";
const EXPLORER_EXPANDED_STORAGE_PREFIX = "gitviz_explorer_expanded";
const CODE_ROW_HEIGHT = 24;
const FILTER_PANEL_WIDTH = 220;

const FOLDER_SORT_PRIORITY: Record<string, number> = {
    src: 0,
    app: 1,
    lib: 2,
    components: 3,
    pages: 4,
    api: 5,
    public: 6,
    assets: 7,
    docs: 90,
    examples: 91,
    test: 92,
    tests: 92,
    __tests__: 92,
};

const FILE_EXTENSION_SORT_PRIORITY: Record<string, number> = {
    ts: 0,
    tsx: 0,
    js: 0,
    jsx: 0,
    mjs: 0,
    cjs: 0,
    py: 1,
    go: 1,
    rs: 1,
    java: 1,
    c: 1,
    cpp: 1,
    h: 1,
    hpp: 1,
    json: 2,
    yml: 2,
    yaml: 2,
    toml: 2,
    ini: 2,
    css: 3,
    scss: 3,
    less: 3,
    html: 3,
    xml: 3,
    md: 9,
    mdx: 9,
    txt: 9,
    rst: 9,
    svg:9,
};

const DEFAULT_FOLDER_SORT_PRIORITY = 50;
const DEFAULT_FILE_EXTENSION_SORT_PRIORITY = 5;

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
const SYMBOL_FILE_LIMIT_LARGE = 100;
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

const EMPTY_SYMBOL_DIAGNOSTICS: SymbolDiagnostics = {
    totalBlobCount: 0,
    candidateCount: 0,
    selectedCount: 0,
    skippedByLimit: 0,
    skippedBySize: 0,
    skippedNotAnalyzable: 0,
    fetchAttempted: 0,
    fetchSucceeded: 0,
    cacheHits: 0,
    fetchFailed: 0,
    largeRepo: false,
    limit: 0,
};

function edgeTypeColor(type: string): string {
    switch (type) {
        case "fileImport":  return "rgba(251,191,36,0.45)";
        case "defines":     return "rgba(34,211,238,0.55)";
        case "imports":     return "rgba(59,130,246,0.55)";
        case "calls":       return "rgba(139,92,246,0.55)";
        case "extends":     return "rgba(249,115,22,0.6)";
        case "implements":  return "rgba(236,72,153,0.6)";
        case "contains":    return "rgba(52,211,153,0.45)";
        default:            return "rgba(255,255,255,0.12)";
    }
}

function edgeSizeFor(type: string): number {
    return type === "fileImport" ? 1.6 : 1;
}

const DIM_COLOR = "#ffffff14";

interface VisibilityState {
    showRoot: boolean;
    showFolders: boolean;
    showFiles: boolean;
    showSymbols: boolean;
    showContainsEdges: boolean;
    showDefinesEdges: boolean;
    showImportsEdges: boolean;
    showCallsEdges: boolean;
    showExtendsEdges: boolean;
    showImplementsEdges: boolean;
    showFileImportEdges: boolean;
    symbolKindVisibility: Record<SymbolKind, boolean>;
}

// Sigma reserves the `type` attribute for its renderer program name.
// We store our semantic node kind as `nodeType` instead.
type SigmaNodeAttrs = Omit<SimNode, "type"> & {
    nodeType: SimNode["type"];
    x: number;
    y: number;
    size: number;
    color: string;
    baseColor: string;
    hidden: boolean;
    highlighted: boolean;
};

interface D3Node extends SimulationNodeDatum {
    id: string;
    nodeType: SimNode["type"];
    size: number;
}
interface D3Link extends SimulationLinkDatum<D3Node> {
    edgeType: string;
}

// Incrementally sync node/edge data into an existing Graphology graph.
// Existing nodes keep their current x/y so layout positions are preserved.
// New nodes get seeded in concentric rings by type.
function syncGraphData(
    graph: Graph,
    visNodes: Array<{ data: Record<string, unknown> }>,
    visEdges: Array<{ data: Record<string, unknown> }>
): { nodeList: SigmaNodeAttrs[]; pathToId: Map<string, string> } {
    const incomingIds = new Set(visNodes.map((n) => n.data.id as string));

    // 1. Drop stale nodes (also drops their edges automatically in graphology)
    for (const id of graph.nodes()) {
        if (!incomingIds.has(id)) graph.dropNode(id);
    }

    // 2. Compute seed positions for brand-new nodes only
    type RingItem = { id: string; path: string };
    const newNodes = visNodes.filter((n) => !graph.hasNode(n.data.id as string));
    const byType: Record<string, RingItem[]> = { root: [], folder: [], file: [], symbol: [] };
    newNodes.forEach((n) => {
        const id = n.data.id as string;
        const rawType = n.data.type as string;
        const bucket = rawType === "folder" && id === "root" ? "root" : (rawType in byType ? rawType : "file");
        byType[bucket].push({ id, path: (n.data.path as string) ?? "" });
    });
    for (const arr of Object.values(byType)) arr.sort((a, b) => a.path.localeCompare(b.path));
    const seedPositions = new Map<string, { x: number; y: number }>();
    if (byType.root[0]) seedPositions.set(byType.root[0].id, { x: 0, y: 0 });
    const placeRing = (items: RingItem[], minRadius: number, minSpacing: number) => {
        if (!items.length) return;
        const radius = Math.max(minRadius, (items.length * minSpacing) / (Math.PI * 2));
        items.forEach(({ id }, j) => {
            const angle = (j / items.length) * Math.PI * 2;
            seedPositions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        });
    };
    placeRing(byType.folder, 200, 50);
    placeRing(byType.file,   500, 30);
    placeRing(byType.symbol, 850,  18);

    // 3. Add or update every incoming node
    const nodeList: SigmaNodeAttrs[] = [];
    const pathToId = new Map<string, string>();

    visNodes.forEach((n) => {
        const id = n.data.id as string;
        const type = n.data.type as SimNode["type"];
        const size = type === "root" ? 18 : type === "folder" ? 12 : type === "file" ? 7 : 4.5;
        const baseColor = (n.data.color as string) || "#94a3b8";
        const kind = n.data.symbolKind as SymbolKind | undefined;
        const label = ((n.data.displayLabel ?? n.data.label) as string) || "";
        const path = n.data.path as string | undefined;

        if (graph.hasNode(id)) {
            // Keep current layout position — only update visual / metadata attrs
            const ex = graph.getNodeAttributes(id);
            graph.mergeNodeAttributes(id, {
                nodeType: type, size, baseColor, color: ex.color ?? baseColor,
                label, ext: n.data.extension, showLabel: n.data.showLabel,
                symbolKind: kind, parentPath: n.data.parentPath, path,
                rawSize: n.data.rawSize, hubScore: n.data.hubScore,
                hidden: false, highlighted: false,
            });
        } else {
            const seed = seedPositions.get(id) ?? { x: 0, y: 0 };
            graph.addNode(id, {
                id, nodeType: type, radius: size, label,
                ext: n.data.extension, showLabel: n.data.showLabel,
                symbolKind: kind, parentPath: n.data.parentPath, path,
                rawSize: n.data.rawSize, hubScore: n.data.hubScore,
                x: seed.x, y: seed.y, size,
                color: baseColor, baseColor, hidden: false, highlighted: false,
            } as SigmaNodeAttrs);
        }
        nodeList.push(graph.getNodeAttributes(id) as SigmaNodeAttrs);
        if (path !== undefined && path !== null) pathToId.set(String(path), id);
        if (id === "root") pathToId.set("", id);
    });

    // 4. Sync edges: drop stale, add new
    const incomingEdgeKeys = new Set(
        visEdges.map((e) => `${e.data.source as string}\0${e.data.target as string}`)
    );
    const edgesToDrop: string[] = [];
    graph.forEachEdge((id, _a, src, tgt) => {
        if (!incomingEdgeKeys.has(`${src}\0${tgt}`)) edgesToDrop.push(id);
    });
    edgesToDrop.forEach((id) => graph.dropEdge(id));

    visEdges.forEach((e) => {
        const src = e.data.source as string;
        const tgt = e.data.target as string;
        if (!graph.hasNode(src) || !graph.hasNode(tgt) || graph.hasEdge(src, tgt)) return;
        const edgeType = e.data.type as string;
        graph.addEdge(src, tgt, {
            edgeType,
            color: edgeTypeColor(edgeType),
            baseColor: edgeTypeColor(edgeType),
            size: edgeSizeFor(edgeType),
            hidden: false,
        });
    });

    return { nodeList, pathToId };
}

function d3ChargeFor(nodeType: SimNode["type"]): number {
    switch (nodeType) {
        case "root":   return -1200;
        case "folder": return -600;
        case "file":   return -250;
        case "symbol": return -60;
        default:       return -150;
    }
}

function d3LinkDistance(edgeType: string): number {
    switch (edgeType) {
        case "defines":    return 40;
        case "fileImport": return 100;
        case "contains":   return 120;
        default:           return 80;
    }
}

export default function FileTreeGraph({ tree, owner, repo, fileTypeLegend = [] }: FileTreeGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const symbolCacheRef = useRef(new Map<string, string>());
    const symbolWorkerRef = useRef<Worker | null>(null);
    const importWorkerRef = useRef<Worker | null>(null);
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
    const showSymbols = true;
    const [showContainsEdges, setShowContainsEdges] = useState(true);
    const [showDefinesEdges, setShowDefinesEdges] = useState(false);
    const [showImportsEdges, setShowImportsEdges] = useState(false);
    const [showCallsEdges, setShowCallsEdges] = useState(false);
    const [showExtendsEdges, setShowExtendsEdges] = useState(false);
    const [showImplementsEdges, setShowImplementsEdges] = useState(false);
    const [showFileImportEdges, setShowFileImportEdges] = useState(false);
    const [fileImportEdges, setFileImportEdges] = useState<FileImportEdge[]>([]);
    const [multiLangLoading, setMultiLangLoading] = useState(false);
    const [symbolKindVisibility, setSymbolKindVisibility] = useState<Record<SymbolKind, boolean>>({
        class: false,
        function: false,
        interface: false,
        type: false,
        method: false,
        variable: false,
    });
    const [symbolLoading, setSymbolLoading] = useState(false);
    const [symbolError, setSymbolError] = useState<string | null>(null);
    const [symbolDiagnostics, setSymbolDiagnostics] = useState<SymbolDiagnostics>(EMPTY_SYMBOL_DIAGNOSTICS);
    const [showExplorer, setShowExplorer] = useState(true);
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
    const sigmaRef = useRef<Sigma | null>(null);
    const graphRef = useRef<Graph | null>(null);
    const simRef = useRef<Simulation<D3Node, D3Link> | null>(null);
    const simNodesRef = useRef<Map<string, D3Node>>(new Map());
    const layoutStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const layoutSettledRef = useRef(false);
    const savedCameraRef = useRef<{ x: number; y: number; ratio: number; angle: number } | null>(null);
    const pathToIdRef = useRef<Map<string, string>>(new Map());
    const visibleNodesRef = useRef<SigmaNodeAttrs[]>([]);
    const lockedNodeIdRef = useRef<string | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const draggedNodeRef = useRef<string | null>(null);
    const dragMousePosRef = useRef<{ x: number; y: number } | null>(null);
    const resizingRef = useRef(false);
    const explorerWidthRef = useRef(220);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(220);
    const inspectorResizingRef = useRef(false);
    const inspectorWidthRef = useRef(440);
    const inspectorDragStartXRef = useRef(0);
    const inspectorDragStartWidthRef = useRef(440);
    const filterResizingRef = useRef(false);
    const filterWidthRef = useRef(FILTER_PANEL_WIDTH);
    const filterDragStartXRef = useRef(0);
    const filterDragStartWidthRef = useRef(FILTER_PANEL_WIDTH);
    const explorerBodyRef = useRef<HTMLDivElement>(null);
    const explorerListRef = useRef<{
        element: HTMLDivElement | null;
        scrollToRow: (config: { index: number; align?: "auto" | "center" | "end" | "smart" | "start"; behavior?: "auto" | "instant" | "smooth" }) => void;
    } | null>(null);
    const [symbolGraph, setSymbolGraph] = useState<import("@/lib/symbol-parser").SymbolGraphData>({
        symbols: [],
        references: [],
    });
    const [inspectorWidth, setInspectorWidth] = useState(440);
    const [filterPanelWidth, setFilterPanelWidth] = useState(FILTER_PANEL_WIDTH);
    const visibilityRef = useRef<VisibilityState>({
        showRoot: true,
        showFolders: true,
        showFiles: true,
        showSymbols: true,
        showContainsEdges: true,
        showDefinesEdges: false,
        showImportsEdges: false,
        showCallsEdges: false,
        showExtendsEdges: false,
        showImplementsEdges: false,
        showFileImportEdges: false,
        symbolKindVisibility: {
            class: false,
            function: false,
            interface: false,
            type: false,
            method: false,
            variable: false,
        },
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

        const getFolderSortPriority = (name: string) => {
            const normalized = name.toLowerCase();
            return FOLDER_SORT_PRIORITY[normalized] ?? DEFAULT_FOLDER_SORT_PRIORITY;
        };

        const getFileSortPriority = (name: string, extension?: string) => {
            const normalizedExtension = (extension ?? name.split(".").pop() ?? "").toLowerCase();
            return FILE_EXTENSION_SORT_PRIORITY[normalizedExtension] ?? DEFAULT_FILE_EXTENSION_SORT_PRIORITY;
        };

        const sortNodes = (node: ExplorerNode) => {
            if (!node.children) return;
            node.children.sort((a, b) => {
                if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

                if (a.type === "folder" && b.type === "folder") {
                    const folderPriorityDiff = getFolderSortPriority(a.name) - getFolderSortPriority(b.name);
                    if (folderPriorityDiff !== 0) return folderPriorityDiff;
                    return a.name.localeCompare(b.name);
                }

                const filePriorityDiff = getFileSortPriority(a.name, a.extension) - getFileSortPriority(b.name, b.extension);
                if (filePriorityDiff !== 0) return filePriorityDiff;

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

    // cosmos.gl auto-handles canvas resize — this observer is no longer needed.

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (resizingRef.current) {
                const delta = event.clientX - dragStartXRef.current;
                const nextWidth = Math.min(360, Math.max(180, dragStartWidthRef.current + delta));
                explorerWidthRef.current = nextWidth;
                const el = document.getElementById("file-explorer-panel");
                if (el) { el.style.transition = "none"; el.style.width = `${nextWidth}px`; }
                const inner = document.getElementById("file-explorer-inner");
                if (inner) inner.style.width = `${nextWidth}px`;
            } else if (inspectorResizingRef.current) {
                const delta = event.clientX - inspectorDragStartXRef.current;
                const nextWidth = Math.min(700, Math.max(280, inspectorDragStartWidthRef.current + delta));
                inspectorWidthRef.current = nextWidth;
                const el = document.getElementById("inspector-panel-inner");
                if (el) el.style.width = `${nextWidth}px`;
                const motion = document.getElementById("inspector-panel-motion");
                if (motion) { motion.style.transition = "none"; motion.style.width = `${nextWidth}px`; }
            } else if (filterResizingRef.current) {
                // Filters panel is on the right; dragging left expands it
                const delta = filterDragStartXRef.current - event.clientX;
                const nextWidth = Math.min(400, Math.max(180, filterDragStartWidthRef.current + delta));
                filterWidthRef.current = nextWidth;
                const el = document.getElementById("filter-panel-inner");
                if (el) el.style.width = `${nextWidth}px`;
                const motion = document.getElementById("filter-panel-motion");
                if (motion) { motion.style.transition = "none"; motion.style.width = `${nextWidth}px`; }
            }
        };

        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = false;
                const el = document.getElementById("file-explorer-panel");
                if (el) el.style.transition = "";
                setExplorerWidth(explorerWidthRef.current);
            } else if (inspectorResizingRef.current) {
                inspectorResizingRef.current = false;
                const motion = document.getElementById("inspector-panel-motion");
                if (motion) motion.style.transition = "";
                setInspectorWidth(inspectorWidthRef.current);
            } else if (filterResizingRef.current) {
                filterResizingRef.current = false;
                const motion = document.getElementById("filter-panel-motion");
                if (motion) motion.style.transition = "";
                setFilterPanelWidth(filterWidthRef.current);
            } else {
                return;
            }
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
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
            const params = new URLSearchParams({ owner, repo, path: file.path });
            const res = await fetch(`/api/github/repo/file?${params}`);
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
        // Skip whole-file Prism on very large files — synchronous highlight on
        // tens of thousands of lines blocks the main thread for hundreds of ms.
        // Threshold mirrors typical viewport content (~50 lines × 30 viewport heights).
        const HIGHLIGHT_LINE_LIMIT = 1500;
        const tooLarge = rawLines.length > HIGHLIGHT_LINE_LIMIT;
        const highlighted = grammar && !tooLarge
            ? Prism.highlight(fileContent, grammar, lang).split("\n")
            : [];

        return rawLines.map((raw, index) => {
            const leadingWhitespace = raw.match(/^[\t ]+/)?.[0] ?? "";
            const spaces = leadingWhitespace.replace(/\t/g, "    ").length;
            return {
                lineNumber: index + 1,
                raw,
                html: grammar && !tooLarge ? (highlighted[index] ?? "") : null,
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
        let idleId = 0;

        idleId = requestIdleCallback(() => {
        const runSymbolAnalysis = async () => {
            const selection = selectSymbolAnalysisFiles(tree, {
                maxFileBytes: MAX_SYMBOL_FILE_BYTES,
                smallLimit: SYMBOL_FILE_LIMIT_SMALL,
                largeLimit: SYMBOL_FILE_LIMIT_LARGE,
                largeRepoThreshold: 800,
            });

            const sourceFiles = selection.sourceFiles;
            const baseDiagnostics: SymbolDiagnostics = {
                totalBlobCount: selection.totalBlobCount,
                candidateCount: selection.candidateCount,
                selectedCount: selection.sourceFiles.length,
                skippedByLimit: selection.skippedByLimit,
                skippedBySize: selection.skippedBySize,
                skippedNotAnalyzable: selection.skippedNotAnalyzable,
                fetchAttempted: 0,
                fetchSucceeded: 0,
                cacheHits: 0,
                fetchFailed: 0,
                largeRepo: selection.largeRepo,
                limit: selection.limit,
            };
            setSymbolDiagnostics(baseDiagnostics);

            if (sourceFiles.length === 0) {
                setSymbolGraph({ symbols: [], references: [] });
                setSymbolError(null);
                setSymbolLoading(false);
                return;
            }

            setSymbolLoading(true);
            setSymbolError(null);

            const filePayload: Array<{ path: string; content: string }> = [];
            let fetchAttempted = 0;
            let fetchSucceeded = 0;
            let cacheHits = 0;
            let fetchFailed = 0;

            // Split into cached vs. uncached to avoid fetching what we already have.
            const uncachedPaths: string[] = [];
            for (const item of sourceFiles) {
                const cacheKey = `${owner}/${repo}/${item.path}`;
                const cached = symbolCacheRef.current.get(cacheKey);
                if (cached !== undefined) {
                    cacheHits += 1;
                    fetchAttempted += 1;
                    filePayload.push({ path: item.path, content: cached });
                } else {
                    uncachedPaths.push(item.path);
                }
            }

            if (uncachedPaths.length > 0 && !cancelled) {
                fetchAttempted += uncachedPaths.length;
                try {
                    const res = await fetch("/api/github/repo/files", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ owner, repo, paths: uncachedPaths }),
                    });
                    if (res.ok) {
                        const data: { files: Array<{ path: string; content: string }> } = await res.json();
                        fetchSucceeded += data.files.length;
                        fetchFailed += uncachedPaths.length - data.files.length;
                        for (const file of data.files) {
                            symbolCacheRef.current.set(`${owner}/${repo}/${file.path}`, file.content);
                            filePayload.push(file);
                        }
                    } else {
                        fetchFailed += uncachedPaths.length;
                    }
                } catch {
                    fetchFailed += uncachedPaths.length;
                }
            }

            if (cancelled) return;

            setSymbolDiagnostics({
                ...baseDiagnostics,
                fetchAttempted,
                fetchSucceeded,
                cacheHits,
                fetchFailed,
            });

            if (filePayload.length === 0) {
                setSymbolGraph({ symbols: [], references: [] });
                setSymbolError("Could not fetch source files for symbol graph");
                setSymbolLoading(false);
                return;
            }

            // Terminate any in-flight worker from a prior tree change before
            // starting a new one so stale results are never applied.
            symbolWorkerRef.current?.terminate();
            symbolWorkerRef.current = null;

            const maxReferences = tree.length > 800 ? 400 : 420;

            const worker = new Worker(
                new URL("../../workers/symbol-analysis.worker.ts", import.meta.url)
            );
            symbolWorkerRef.current = worker;

            worker.onmessage = (ev: MessageEvent<{ type: "symbolGraph"; data: import("@/lib/symbol-parser").SymbolGraphData }>) => {
                if (cancelled) { worker.terminate(); symbolWorkerRef.current = null; return; }
                setSymbolGraph(ev.data.data);
                setSymbolLoading(false);
                worker.terminate();
                symbolWorkerRef.current = null;
            };
            worker.onerror = () => {
                if (!cancelled) setSymbolLoading(false);
                worker.terminate();
                symbolWorkerRef.current = null;
            };

            worker.postMessage({ type: "buildSymbolGraph", fileContents: filePayload, maxReferences });
        };

        runSymbolAnalysis();
        }); // end requestIdleCallback

        return () => {
            cancelled = true;
            cancelIdleCallback(idleId);
            symbolWorkerRef.current?.terminate();
            symbolWorkerRef.current = null;
        };
    }, [owner, repo, tree]);

    // Multi-language file import analysis (Python, Go, Rust, Java, C/C++, C#)
    // Fetches non-JS/TS source files and extracts file-to-file import edges.
    useEffect(() => {
        let cancelled = false;
        let idleId = 0;

        idleId = requestIdleCallback(() => {
        const runMultiLangAnalysis = async () => {
            const jstsExts = new Set(["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"]);
            const nonJsTsFiles = tree.filter((item) => {
                if (item.type !== "blob") return false;
                const ext = item.path.split(".").pop()?.toLowerCase() ?? "";
                if (jstsExts.has(ext)) return false;
                return isImportableCodeFile(item.path);
            });

            if (nonJsTsFiles.length === 0) {
                setFileImportEdges([]);
                return;
            }

            setMultiLangLoading(true);
            const selected = nonJsTsFiles.slice(0, 60);
            const filePayload: Array<{ path: string; content: string }> = [];

            // Serve from cache where possible; batch-fetch the rest in one request.
            const uncachedPaths: string[] = [];
            for (const item of selected) {
                const cacheKey = `${owner}/${repo}/${item.path}`;
                const cached = symbolCacheRef.current.get(cacheKey);
                if (cached !== undefined) {
                    filePayload.push({ path: item.path, content: cached });
                } else {
                    uncachedPaths.push(item.path);
                }
            }

            if (uncachedPaths.length > 0 && !cancelled) {
                try {
                    const res = await fetch("/api/github/repo/files", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ owner, repo, paths: uncachedPaths }),
                    });
                    if (res.ok) {
                        const data: { files: Array<{ path: string; content: string }> } = await res.json();
                        for (const file of data.files) {
                            symbolCacheRef.current.set(`${owner}/${repo}/${file.path}`, file.content);
                            filePayload.push(file);
                        }
                    }
                } catch { /* ignore batch fetch failures */ }
            }

            if (cancelled) return;

            const fileSet = tree.map((i) => i.path);

            importWorkerRef.current?.terminate();
            importWorkerRef.current = null;

            const worker = new Worker(
                new URL("../../workers/symbol-analysis.worker.ts", import.meta.url)
            );
            importWorkerRef.current = worker;

            worker.onmessage = (ev: MessageEvent<{ type: "importEdges"; data: FileImportEdge[] }>) => {
                if (cancelled) { worker.terminate(); importWorkerRef.current = null; return; }
                setFileImportEdges(ev.data.data);
                setMultiLangLoading(false);
                worker.terminate();
                importWorkerRef.current = null;
            };
            worker.onerror = () => {
                if (!cancelled) setMultiLangLoading(false);
                worker.terminate();
                importWorkerRef.current = null;
            };

            worker.postMessage({ type: "extractFileToFileImports", fileContents: filePayload, fileSet });
        };

        runMultiLangAnalysis();
        }); // end requestIdleCallback

        return () => {
            cancelled = true;
            cancelIdleCallback(idleId);
            importWorkerRef.current?.terminate();
            importWorkerRef.current = null;
        };
    }, [owner, repo, tree]);

    // Build graph elements — show all files
    const elements = useMemo(() => {
        const nodes: Array<{ data: Record<string, unknown> }> = [];
        const edges: Array<{ data: Record<string, unknown> }> = [];
        const addedFolders = new Set<string>();

        // Smart filtering for large repos: score and prioritise the most important files.
        const MAX_GRAPH_ITEMS = 2000;
        const PRIORITY_TOP_DIRS = new Set([
            "src", "lib", "app", "components", "core", "api", "pkg", "cmd",
            "internal", "server", "client", "ui", "pages", "routes", "services",
        ]);
        let limitedItems: typeof tree;
        if (tree.length <= MAX_GRAPH_ITEMS) {
            limitedItems = tree;
        } else {
            const CODE_EXTS = new Set([
                "ts", "tsx", "js", "jsx", "py", "go", "rs", "java",
                "c", "cpp", "cs", "rb", "swift", "kt", "scala",
            ]);
            const scored = tree.map((item) => {
                const parts = item.path.split("/");
                const depth = parts.length;
                const topDir = parts[0]?.toLowerCase() ?? "";
                const ext = (item.path.split(".").pop() ?? "").toLowerCase();
                let score = Math.max(0, 6 - depth) * 2;
                if (PRIORITY_TOP_DIRS.has(topDir)) score += 10;
                if (CODE_EXTS.has(ext)) score += 8;
                const lower = item.path.toLowerCase();
                if (lower.includes("test") || lower.includes("spec") || lower.includes("__test__")) score -= 5;
                if (parts.some((p) => p.startsWith("."))) score -= 8;
                return { item, score };
            });
            scored.sort((a, b) => b.score - a.score);
            limitedItems = scored.slice(0, MAX_GRAPH_ITEMS).map((s) => s.item);
        }

        // Pre-compute inbound import counts for hub node sizing
        const filteredPathSet = new Set(limitedItems.map((i) => i.path));
        const inboundImportCount = new Map<string, number>();
        symbolGraph.references.forEach((ref) => {
            if (filteredPathSet.has(ref.toFilePath)) {
                inboundImportCount.set(ref.toFilePath, (inboundImportCount.get(ref.toFilePath) ?? 0) + 1);
            }
        });
        fileImportEdges.forEach((edge) => {
            if (filteredPathSet.has(edge.toFilePath)) {
                inboundImportCount.set(edge.toFilePath, (inboundImportCount.get(edge.toFilePath) ?? 0) + 1);
            }
        });

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
                const hubBoost = Math.min(18, (inboundImportCount.get(item.path) ?? 0) * 2);
                nodes.push({
                    data: {
                        id: `file:${item.path}`,
                        label,
                        displayLabel: label, // Only file name
                        compactLabel: getCompactLabel(label, 20),
                        path: item.path,
                        type: "file",
                        extension: ext,
                        size: item.size
                            ? Math.max(12, Math.min(42, Math.log10(item.size) * 5 + hubBoost))
                            : Math.max(12, 12 + hubBoost),
                        color: getFileColor(label),
                        rawSize: item.size,
                        hubScore: inboundImportCount.get(item.path) ?? 0,
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

        // Add direct file-to-file code import edges (visually distinct from tree edges)
        {
            const fileIds = new Set<string>(
                nodes
                    .filter((n) => (n.data as Record<string, unknown>).type === "file")
                    .map((n) => (n.data as Record<string, unknown>).id as string)
            );
            const seenPairs = new Set<string>();
            const largeCap = limitedItems.length > 800;

            // From JS/TS symbol references (file→file derived)
            symbolGraph.references.forEach((ref) => {
                if (largeCap && ref.confidence !== "high") return;
                const fromId = `file:${ref.fromFilePath}`;
                const toId = `file:${ref.toFilePath}`;
                if (!fileIds.has(fromId) || !fileIds.has(toId)) return;
                const pairKey = `${ref.fromFilePath}\0${ref.toFilePath}`;
                if (seenPairs.has(pairKey)) return;
                seenPairs.add(pairKey);
                edges.push({
                    data: {
                        id: `fileImport:${pairKey}`,
                        source: fromId,
                        target: toId,
                        type: "fileImport",
                        confidence: ref.confidence,
                    },
                });
            });

            // From multi-language import edges
            fileImportEdges.forEach((edge) => {
                const fromId = `file:${edge.fromFilePath}`;
                const toId = `file:${edge.toFilePath}`;
                if (!fileIds.has(fromId) || !fileIds.has(toId)) return;
                const pairKey = `${edge.fromFilePath}\0${edge.toFilePath}`;
                if (seenPairs.has(pairKey)) return;
                seenPairs.add(pairKey);
                edges.push({
                    data: {
                        id: `fileImport:${pairKey}`,
                        source: fromId,
                        target: toId,
                        type: "fileImport",
                        confidence: edge.confidence,
                    },
                });
            });
        }

        return { nodes, edges };
    }, [tree, repo, symbolGraph, fileImportEdges]);

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

    // Stable fingerprint: only changes when the node/edge set actually changes.
    const graphKey = useMemo(() => {
        if (!elements.nodes.length) return "empty";
        return [
            elements.nodes.length,
            (elements.nodes[0]?.data as Record<string, unknown>)?.id ?? "",
            (elements.nodes[elements.nodes.length - 1]?.data as Record<string, unknown>)?.id ?? "",
            elements.edges.length,
        ].join("|");
    }, [elements]);
    // Keep a ref to the latest elements so Effect 1's async init can read current data.
    const elementsRef = useRef(elements);
    useEffect(() => { elementsRef.current = elements; }, [elements]);

    const restoreColors = useCallback(() => {
        const graph = graphRef.current;
        if (!graph) return;
        graph.forEachNode((id, attrs) => {
            if (attrs.color !== attrs.baseColor) graph.setNodeAttribute(id, "color", attrs.baseColor as string);
        });
        graph.forEachEdge((id, attrs) => {
            if (attrs.color !== attrs.baseColor) graph.setEdgeAttribute(id, "color", attrs.baseColor as string);
        });
        sigmaRef.current?.refresh();
    }, []);

    const applyHoverEffect = useCallback((hoveredId: string | null) => {
        const graph = graphRef.current;
        if (!graph) return;
        if (!hoveredId || !graph.hasNode(hoveredId)) {
            restoreColors();
            return;
        }
        const neighbors = new Set<string>();
        neighbors.add(hoveredId);
        graph.forEachNeighbor(hoveredId, (nb) => neighbors.add(nb));

        graph.forEachNode((id, attrs) => {
            const next = neighbors.has(id) ? (attrs.baseColor as string) : DIM_COLOR;
            if (attrs.color !== next) graph.setNodeAttribute(id, "color", next);
        });
        graph.forEachEdge((id, attrs, src, tgt) => {
            const connected = src === hoveredId || tgt === hoveredId;
            const next = connected ? (attrs.baseColor as string) : "rgba(255,255,255,0.025)";
            if (attrs.color !== next) graph.setEdgeAttribute(id, "color", next);
        });
        sigmaRef.current?.refresh();
    }, [restoreColors]);

    const applyVisibility = useCallback(() => {
        const graph = graphRef.current;
        const sigma = sigmaRef.current;
        if (!graph || !sigma) return;
        const v = visibilityRef.current;
        const symbolsVisible = v.showSymbols && v.showFiles;

        graph.forEachNode((id, attrs) => {
            const t = attrs.nodeType as SimNode["type"];
            let hidden = false;
            if (t === "folder" && id === "root") hidden = !v.showRoot;
            else if (t === "folder") hidden = !v.showFolders;
            else if (t === "file") hidden = !v.showFiles;
            else if (t === "symbol") {
                const k = attrs.symbolKind as SymbolKind | undefined;
                hidden = !symbolsVisible || (k ? !v.symbolKindVisibility[k] : false);
            }
            if (attrs.hidden !== hidden) graph.setNodeAttribute(id, "hidden", hidden);
        });

        graph.forEachEdge((id, attrs) => {
            const t = attrs.edgeType as string;
            let hidden = false;
            switch (t) {
                case "contains":   hidden = !v.showContainsEdges; break;
                case "defines":    hidden = !(v.showDefinesEdges && symbolsVisible); break;
                case "imports":    hidden = !(v.showImportsEdges && symbolsVisible); break;
                case "calls":      hidden = !(v.showCallsEdges && symbolsVisible); break;
                case "extends":    hidden = !(v.showExtendsEdges && symbolsVisible); break;
                case "implements": hidden = !(v.showImplementsEdges && symbolsVisible); break;
                case "fileImport": hidden = !(v.showFileImportEdges && v.showFiles); break;
                default: hidden = true;
            }
            if (attrs.hidden !== hidden) graph.setEdgeAttribute(id, "hidden", hidden);
        });

        sigma.refresh();
    }, []);

    const restartLayout = useCallback(() => {
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (layoutStopTimerRef.current) clearTimeout(layoutStopTimerRef.current);
        layoutStopTimerRef.current = null;
        simRef.current?.stop();
        simRef.current = null;
        simNodesRef.current.clear();
        layoutSettledRef.current = false;

        const graph = graphRef.current;
        const sigma = sigmaRef.current;
        if (!graph || !sigma || graph.order === 0) return;

        // Build d3 node objects seeded from current Graphology positions (visible only)
        const d3Nodes: D3Node[] = [];
        const nodeMap = new Map<string, D3Node>();
        graph.forEachNode((id, attrs) => {
            if (attrs.hidden) return;
            const node: D3Node = {
                id,
                nodeType: attrs.nodeType as SimNode["type"],
                size: attrs.size as number,
                x: attrs.x as number,
                y: attrs.y as number,
            };
            d3Nodes.push(node);
            nodeMap.set(id, node);
        });

        // Build d3 link objects (visible only)
        const d3Links: D3Link[] = [];
        graph.forEachEdge((_id, attrs, src, tgt) => {
            if (attrs.hidden) return;
            const source = nodeMap.get(src);
            const target = nodeMap.get(tgt);
            if (source && target) {
                d3Links.push({ source, target, edgeType: attrs.edgeType as string });
            }
        });

        simNodesRef.current = nodeMap;

        import("d3-force").then((d3) => {
            const g = graphRef.current;
            const s = sigmaRef.current;
            if (!g || !s) return;

            const nodeCount = d3Nodes.length;
            const linkForce = d3.forceLink<D3Node, D3Link>(d3Links)
                .id((n) => n.id)
                .distance((l) => d3LinkDistance((l as D3Link).edgeType))
                .strength(0.4);

            const sim = d3.forceSimulation<D3Node, D3Link>(d3Nodes)
                .force("charge", d3.forceManyBody<D3Node>().strength((n) => d3ChargeFor(n.nodeType)))
                .force("link", linkForce as unknown as d3.Force<D3Node, D3Link>)
                .force("center", d3.forceCenter(0, 0).strength(0.05))
                .force("collision", d3.forceCollide<D3Node>().radius((n) => n.size + 3).strength(0.7))
                .alphaDecay(0.01)
                .alphaTarget(0.003)
                .stop();

            simRef.current = sim;

            // After settle time, lower alphaTarget for micro-motion only
            const settleMs = nodeCount < 200 ? 3000 : nodeCount < 1000 ? 5000 : nodeCount < 3000 ? 7000 : 5000;
            layoutStopTimerRef.current = setTimeout(() => {
                sim.alphaTarget(0.001);
                layoutSettledRef.current = true;
            }, settleMs);

            // RAF loop: tick d3, pin dragged node, write positions to Graphology, refresh Sigma
            const tick = () => {
                sim.tick();
                const pinId = draggedNodeRef.current;
                const pinPos = dragMousePosRef.current;
                sim.nodes().forEach((n) => {
                    if (!g.hasNode(n.id)) return;
                    if (n.id === pinId && pinPos) {
                        n.fx = pinPos.x;
                        n.fy = pinPos.y;
                    }
                    g.setNodeAttribute(n.id, "x", n.x ?? 0);
                    g.setNodeAttribute(n.id, "y", n.y ?? 0);
                });
                s.refresh();
                animFrameRef.current = requestAnimationFrame(tick);
            };
            animFrameRef.current = requestAnimationFrame(tick);
        });
    }, []);

    // Update d3 sim forces in-place with only currently visible nodes/edges, then bump alpha.
    // Preserves current positions and velocities — no teardown, no camera reset.
    const reheatSim = useCallback(() => {
        const sim = simRef.current;
        const graph = graphRef.current;
        if (!sim || !graph) return;

        const d3Nodes: D3Node[] = [];
        const nodeMap = new Map<string, D3Node>();
        graph.forEachNode((id, attrs) => {
            if (attrs.hidden) return;
            const existing = simNodesRef.current.get(id);
            const node: D3Node = existing ?? {
                id,
                nodeType: attrs.nodeType as SimNode["type"],
                size: attrs.size as number,
                x: attrs.x as number,
                y: attrs.y as number,
            };
            d3Nodes.push(node);
            nodeMap.set(id, node);
        });
        const d3Links: D3Link[] = [];
        graph.forEachEdge((_id, attrs, src, tgt) => {
            if (attrs.hidden) return;
            const source = nodeMap.get(src);
            const target = nodeMap.get(tgt);
            if (source && target) {
                d3Links.push({ source, target, edgeType: attrs.edgeType as string });
            }
        });
        simNodesRef.current = nodeMap;

        import("d3-force").then((d3) => {
            const s = simRef.current;
            if (!s) return;
            const linkForce = d3.forceLink<D3Node, D3Link>(d3Links)
                .id((n) => n.id)
                .distance((l) => d3LinkDistance((l as D3Link).edgeType))
                .strength(0.4);
            s.nodes(d3Nodes);
            s.force("charge", d3.forceManyBody<D3Node>().strength((n) => d3ChargeFor(n.nodeType)));
            s.force("link", linkForce as unknown as d3.Force<D3Node, D3Link>);
            s.force("collision", d3.forceCollide<D3Node>().radius((n) => n.size + 3).strength(0.7));
            // Bump alpha so RAF tick produces movement; no restart of d3's internal timer
            s.alpha(Math.max(s.alpha(), 0.2)).alphaTarget(0.003);
            if (layoutStopTimerRef.current) clearTimeout(layoutStopTimerRef.current);
            layoutSettledRef.current = false;
            const nodeCount = d3Nodes.length;
            const settleMs = nodeCount < 200 ? 2000 : nodeCount < 1000 ? 4000 : 5000;
            layoutStopTimerRef.current = setTimeout(() => {
                s.alphaTarget(0.001);
                layoutSettledRef.current = true;
            }, settleMs);
        });
    }, []);

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

    const focusNodeInGraph = useCallback((path: string) => {
        const id = pathToIdRef.current.get(path);
        const graph = graphRef.current;
        const sigma = sigmaRef.current;
        if (!id || !graph?.hasNode(id) || !sigma) return;
        const attrs = graph.getNodeAttributes(id);
        if (attrs.hidden) return;
        lockedNodeIdRef.current = id;
        applyHoverEffect(id);
        const displayData = sigma.getNodeDisplayData(id);
        if (!displayData) return;
        sigma.getCamera().animate({ x: displayData.x, y: displayData.y, ratio: 0.35 }, { duration: 400 });
    }, [applyHoverEffect]);

    const focusExplorerPath = useCallback((path: string) => {
        setTreeFocusPath(path);
        const nextIndex = explorerRowIndexByPath.get(path);
        if (nextIndex !== undefined) {
            explorerListRef.current?.scrollToRow({ index: nextIndex, align: "smart", behavior: "auto" });
        }
        focusNodeInGraph(path);
    }, [explorerRowIndexByPath, focusNodeInGraph]);

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

        focusNodeInGraph(node.path);
    }, [expandParentFolders, focusNodeInGraph]);

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

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        const graph = graphRef.current;
        const sigma = sigmaRef.current;
        if (!graph || !sigma) return;

        if (!query.trim()) {
            restoreColors();
            return;
        }

        const q = query.toLowerCase();
        graph.forEachNode((id, attrs) => {
            const labelStr = String(attrs.label ?? "").toLowerCase();
            const pathStr = String(attrs.path ?? "").toLowerCase();
            const matches = labelStr.includes(q) || pathStr.includes(q);
            const next = matches ? "#facc15" : DIM_COLOR;
            if (attrs.color !== next) graph.setNodeAttribute(id, "color", next);
        });
        sigma.refresh();
    }, [restoreColors]);

    // Effect 1 — create Sigma instance once. Runs only on mount.
    // Event handlers are wired here; restoreColors/applyHoverEffect are stable callbacks ([] deps).
    useEffect(() => {
        if (!containerRef.current || typeof window === "undefined") return;
        let cancelled = false;

        (async () => {
            const { default: SigmaClass } = await import("sigma");
            if (cancelled || !containerRef.current) return;

            const graph = new Graph({ multi: false, type: "directed" });
            graphRef.current = graph;

            // Seed any elements already available by the time the import resolves.
            // Sync ALL nodes/edges — applyVisibility (called below) sets hidden correctly.
            const elems = elementsRef.current;
            if (elems.nodes.length) {
                const { nodeList, pathToId } = syncGraphData(
                    graph,
                    elems.nodes as Array<{ data: Record<string, unknown> }>,
                    elems.edges as Array<{ data: Record<string, unknown> }>
                );
                visibleNodesRef.current = nodeList;
                pathToIdRef.current = pathToId;
            }

            const nodeCount = graph.order;
            const sigma = new SigmaClass(graph, containerRef.current!, {
                allowInvalidContainer: true,
                renderEdgeLabels: false,
                defaultEdgeType: "line",
                defaultNodeType: "circle",
                hideEdgesOnMove: nodeCount > 800,
                hideLabelsOnMove: true,
                minCameraRatio: 0.05,
                maxCameraRatio: 10,
                labelSize: 11,
                labelFont: "monospace",
                labelColor: { color: "#94a3b8" },
                labelRenderedSizeThreshold: nodeCount > 3000 ? 12 : nodeCount > 1000 ? 9 : 6,
                zIndex: true,
            });
            sigmaRef.current = sigma;

            if (savedCameraRef.current) {
                sigma.getCamera().setState(savedCameraRef.current);
            }

            restartLayout();

            // Hover (Obsidian dim)
            sigma.on("enterNode", ({ node }) => {
                if (lockedNodeIdRef.current !== null) return;
                applyHoverEffect(node);
            });
            sigma.on("leaveNode", () => {
                if (lockedNodeIdRef.current !== null) return;
                restoreColors();
            });

            // Click — open inspector and lock focus
            sigma.on("clickNode", ({ node }) => {
                const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
                lockedNodeIdRef.current = node;
                applyHoverEffect(node);
                if (attrs.nodeType === "file") {
                    setSymbolFocus(null);
                    setFocusLine(null);
                    setShowExplorerInspector(true);
                    setSelectedFile({
                        label: attrs.label,
                        path: attrs.path ?? "",
                        type: "file",
                        extension: attrs.ext,
                        size: attrs.rawSize,
                    });
                } else if (attrs.nodeType === "symbol" && attrs.parentPath) {
                    const fileLabel = attrs.parentPath.split("/").pop() || attrs.parentPath;
                    const ext = fileLabel.includes(".") ? fileLabel.split(".").pop() : undefined;
                    setSymbolFocus(attrs.label);
                    setFocusLine(null);
                    setShowExplorerInspector(true);
                    setSelectedFile({
                        label: fileLabel,
                        path: attrs.parentPath,
                        type: "file",
                        extension: ext,
                    });
                }
            });
            sigma.on("clickStage", () => {
                lockedNodeIdRef.current = null;
                restoreColors();
            });

            // Live physics drag using d3 fx/fy pinning — true Obsidian-style.
            const camera = sigma.getCamera();
            sigma.on("downNode", ({ node }) => {
                draggedNodeRef.current = node;
                const simNode = simNodesRef.current.get(node);
                if (simNode) {
                    dragMousePosRef.current = { x: simNode.x ?? 0, y: simNode.y ?? 0 };
                }
                graph.setNodeAttribute(node, "highlighted", true);
                camera.disable();
                // Reheat simulation so neighbours react visibly
                const sim = simRef.current;
                if (sim) sim.alpha(Math.max(sim.alpha(), 0.3)).alphaTarget(0.3);
            });
            const captor = sigma.getMouseCaptor();
            const onBodyMove = (e: { x: number; y: number; preventSigmaDefault: () => void; original: Event }) => {
                if (!draggedNodeRef.current) return;
                dragMousePosRef.current = sigma.viewportToGraph({ x: e.x, y: e.y });
                // RAF tick handles fx/fy pin + sigma.refresh() — no manual call needed
                e.preventSigmaDefault();
                e.original.preventDefault();
                e.original.stopPropagation();
            };
            const endDrag = () => {
                const node = draggedNodeRef.current;
                if (!node) return;
                // Release d3 pin
                const simNode = simNodesRef.current.get(node);
                if (simNode) { simNode.fx = undefined; simNode.fy = undefined; }
                graph.removeNodeAttribute(node, "highlighted");
                draggedNodeRef.current = null;
                dragMousePosRef.current = null;
                camera.enable();
                // Cool down to micro-motion target
                const sim = simRef.current;
                if (sim) sim.alphaTarget(layoutSettledRef.current ? 0.001 : 0.003);
            };
            captor.on("mousemovebody", onBodyMove);
            captor.on("mouseup", endDrag);
            captor.on("mouseleave", endDrag);
        })();

        return () => {
            cancelled = true;
            savedCameraRef.current = sigmaRef.current?.getCamera().getState() ?? null;
            draggedNodeRef.current = null;
            dragMousePosRef.current = null;
            if (animFrameRef.current !== null) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            if (layoutStopTimerRef.current) clearTimeout(layoutStopTimerRef.current);
            layoutStopTimerRef.current = null;
            simRef.current?.stop();
            simRef.current = null;
            simNodesRef.current.clear();
            try { sigmaRef.current?.kill(); } catch { /* noop */ }
            sigmaRef.current = null;
            graphRef.current = null;
            pathToIdRef.current = new Map();
            visibleNodesRef.current = [];
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect 2 — incrementally sync graph data when elements change.
    // Sigma instance is already live; we only add/remove/update nodes and edges.
    useEffect(() => {
        const graph = graphRef.current;
        const sigma = sigmaRef.current;
        if (!graph || !sigma) return;

        // Sync ALL elements — applyVisibility sets hidden attrs, restartLayout only picks up visible ones.
        const { nodeList, pathToId } = syncGraphData(
            graph,
            elements.nodes as Array<{ data: Record<string, unknown> }>,
            elements.edges as Array<{ data: Record<string, unknown> }>
        );
        visibleNodesRef.current = nodeList;
        pathToIdRef.current = pathToId;
        lockedNodeIdRef.current = null;

        applyVisibility();
        sigma.refresh();
        restartLayout();
    }, [graphKey, elements, applyVisibility, restartLayout]);

    // Tab visibility: pause simulation when tab is hidden, resume if not yet settled.
    useEffect(() => {
        const handler = () => {
            if (document.hidden) {
                if (animFrameRef.current !== null) {
                    cancelAnimationFrame(animFrameRef.current);
                    animFrameRef.current = null;
                }
                simRef.current?.stop();
            } else if (!layoutSettledRef.current) {
                restartLayout();
            }
        };
        document.addEventListener("visibilitychange", handler);
        return () => document.removeEventListener("visibilitychange", handler);
    }, [restartLayout]);

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
            showFileImportEdges,
            symbolKindVisibility,
        };
        applyVisibility();
        reheatSim();
    }, [showRoot, showFolders, showFiles, showSymbols, showContainsEdges, showDefinesEdges, showImportsEdges, showCallsEdges, showExtendsEdges, showImplementsEdges, showFileImportEdges, symbolKindVisibility, applyVisibility, reheatSim]);

    const handleZoomIn = () => {
        sigmaRef.current?.getCamera().animatedZoom({ duration: 200 });
    };
    const handleZoomOut = () => {
        sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 });
    };
    const handleFit = () => {
        sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
    };


    return (
        <div className="relative w-full h-full min-h-[800px] flex bg-black diagram-grid" style={{ background: '#000000ff' }}>
            <div
                id="file-explorer-panel"
                className="relative z-30 overflow-visible h-full shrink-0 flex transition-[width] duration-200"
                style={{ width: showExplorer ? explorerWidth : 0 }}
            >
                <div id="file-explorer-inner" className="h-full w-full rounded-2xl border border-slate-700/80 bg-slate-950/95 backdrop-blur flex flex-col overflow-hidden" style={{ width: showExplorer ? explorerWidth : 0 }}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                        <span className="ui-eyebrow text-slate-400">Explorer</span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowExplorerInspector((prev) => !prev)}
                                className="h-7 w-7 text-slate-400 hover:text-slate-200"
                                aria-label={showExplorerInspector ? "Hide inspector" : "Show inspector"}
                            >
                                {showExplorerInspector ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowExplorer(false)}
                                className="h-7 w-7 text-slate-400 hover:text-slate-200"
                                aria-label="Collapse explorer"
                            >
                                <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                            </Button>
                        </div>
                    </div>
                    <div className="relative flex-1 overflow-x-hidden overflow-y-hidden ui-body font-mono text-slate-200" ref={explorerBodyRef} tabIndex={0} onKeyDown={handleExplorerKeyboard}>
                        <List
                            listRef={explorerListRef}
                            style={{ height: explorerViewportHeight, width: "100%" }}
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
                                                    focusNodeInGraph(row.path);
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

                {showExplorer && <div
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-20 group"
                    onMouseDown={(e) => {
                        resizingRef.current = true;
                        dragStartXRef.current = e.clientX;
                        dragStartWidthRef.current = explorerWidthRef.current;
                        document.body.style.userSelect = "none";
                        document.body.style.cursor = "col-resize";
                    }}
                ><span className="absolute top-0 bottom-0 right-0 w-px bg-slate-600/80 group-hover:bg-slate-300 transition-colors" /></div>}

                <motion.div
                    id="inspector-panel-motion"
                    className="absolute left-full top-0 h-full z-40 overflow-hidden"
                    initial={false}
                    animate={{
                        width: showExplorerInspector ? inspectorWidth : 0,
                        opacity: showExplorerInspector ? 1 : 0,
                    }}
                    transition={{
                        width: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.5, ease: "easeInOut" },
                    }}
                >
                    <div id="inspector-panel-inner" style={{ width: inspectorWidth }} className="h-full relative">
                    {showExplorerInspector && (
                        <div
                            className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-50 group"
                            onMouseDown={(e) => {
                                inspectorResizingRef.current = true;
                                inspectorDragStartXRef.current = e.clientX;
                                inspectorDragStartWidthRef.current = inspectorWidthRef.current;
                                document.body.style.userSelect = "none";
                                document.body.style.cursor = "col-resize";
                            }}
                        ><span className="absolute top-0 bottom-0 right-0 w-px bg-slate-600/80 group-hover:bg-slate-300 transition-colors" /></div>
                    )}
                    <div className="h-full rounded-2xl bg-[#070b15]/95 backdrop-blur-xl border border-border/30 flex flex-col overflow-hidden">
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
                {!showExplorer && (
                    <button
                        onClick={() => setShowExplorer(true)}
                        className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-slate-700 bg-slate-900/90 backdrop-blur text-slate-300 hover:text-white hover:border-slate-500 text-xs"
                        aria-label="Show explorer"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                        Explorer
                    </button>
                )}
                <div className={`absolute top-3 z-10 flex items-center gap-2 ${showExplorer ? "left-3" : "left-[100px]"}`}>
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

                <motion.div
                    id="filter-panel-motion"
                    className="absolute top-0 right-0 bottom-0 z-20 overflow-hidden"
                    initial={false}
                    animate={{
                        width: showRightFilters ? filterPanelWidth : 0,
                        opacity: showRightFilters ? 1 : 0,
                    }}
                    transition={{
                        width: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.5, ease: "easeInOut" },
                    }}
                >
                    <div id="filter-panel-inner" style={{ width: filterPanelWidth }} className="h-full relative">
                    {showRightFilters && (
                        <div
                            className="absolute top-0 left-0 h-full w-2 cursor-col-resize z-50 group"
                            onMouseDown={(e) => {
                                filterResizingRef.current = true;
                                filterDragStartXRef.current = e.clientX;
                                filterDragStartWidthRef.current = filterWidthRef.current;
                                document.body.style.userSelect = "none";
                                document.body.style.cursor = "col-resize";
                            }}
                        ><span className="absolute top-0 bottom-0 left-0 w-px bg-slate-600/80 group-hover:bg-slate-300 transition-colors" /></div>
                    )}
                    <div className="h-full rounded-2xl bg-slate-900/95 backdrop-blur border border-slate-700/80 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800">
                            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Filters</span>
                            <button onClick={() => setShowRightFilters(false)} className="text-slate-400 hover:text-slate-200" aria-label="Close filters">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto px-2.5 py-2.5 text-[10px] font-mono text-slate-300 space-y-3">
                            <div className="rounded-md border border-slate-700/70 bg-slate-900/70 px-2 py-2 space-y-1">
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                                    <span>Symbol Index</span>
                                    <span>{symbolLoading ? "Indexing" : "Ready"}</span>
                                </div>
                                <p className="text-[10px] text-slate-200">
                                    Indexed {symbolGraph.symbols.length} symbols from {symbolDiagnostics.fetchSucceeded + symbolDiagnostics.cacheHits}/{symbolDiagnostics.selectedCount} files.
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Symbols: JS/TS only. File imports: all languages ({multiLangLoading ? "indexing…" : `${fileImportEdges.length} edges`}).
                                </p>
                                {(symbolDiagnostics.skippedByLimit > 0 || symbolDiagnostics.skippedBySize > 0) && (
                                    <p className="text-[10px] text-amber-300/90">
                                        Skipped {symbolDiagnostics.skippedByLimit} by limit and {symbolDiagnostics.skippedBySize} by size cap.
                                    </p>
                                )}
                                {symbolDiagnostics.fetchFailed > 0 && (
                                    <p className="text-[10px] text-amber-300/90">
                                        {symbolDiagnostics.fetchFailed} source fetches failed; showing partial symbol graph.
                                    </p>
                                )}
                                {symbolError && (
                                    <p className="text-[10px] text-rose-300">{symbolError}</p>
                                )}
                            </div>

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
                                        <button className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${showFileImportEdges ? "bg-slate-800/70 border-slate-600" : "bg-slate-900/70 border-slate-800 opacity-70"}`} onClick={() => setShowFileImportEdges((prev) => !prev)}>
                                            <span className="h-1.5 w-7 rounded-full" style={{ background: "repeating-linear-gradient(90deg,#fbbf24 0,#fbbf24 5px,transparent 5px,transparent 9px)" }} />
                                            <span className="flex-1 text-left text-slate-200">File Imports</span>
                                            <span className="text-slate-500">{clusterInfo.edgeTypeCounts.get("fileImport") ?? 0}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </motion.div>

                {fileTypeLegend.length > 0 && (
                    <div className="absolute bottom-2 right-2 z-20 w-32 rounded-md border border-slate-700 bg-slate-900/55 backdrop-blur p-2">
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

                {tree.length > 2000 && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-950/70 backdrop-blur text-[11px] text-amber-200/90">
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Showing {Math.min(tree.length, 2000).toLocaleString()} of {tree.length.toLocaleString()} files — sorted by relevance
                    </div>
                )}

                <div ref={containerRef} className="w-full h-full min-h-[800px] rounded-xl bg-[#07050f]" />

                <div className="absolute bottom-2 left-2 z-10 flex flex-row items-end gap-2">
                    <div className="rounded-md border border-slate-700 bg-slate-900/90 backdrop-blur p-1.5 flex flex-col gap-1.5">
                        <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-800/80 border border-slate-600 hover:bg-slate-700" onClick={handleZoomIn}><ZoomIn className="w-4 h-4" /></Button>
                        <Button variant="secondary" size="icon" className="w-8 h-8 rounded-md bg-slate-800/80 border border-slate-600 hover:bg-slate-700" onClick={handleZoomOut}><ZoomOut className="w-4 h-4" /></Button>
                        <button
                            onClick={handleFit}
                            className="w-8 h-8 rounded-md text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors flex flex-col items-center justify-center gap-0.5"
                        >
                            <Maximize2 className="w-3 h-3" />
                            
                        </button>
                    </div>
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
