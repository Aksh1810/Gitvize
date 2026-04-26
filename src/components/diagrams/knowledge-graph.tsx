"use client";

// ============================================================================
// GitViz — Knowledge Graph (Sigma.js + WebGL)
// ============================================================================
// GitNexus-style interactive knowledge graph with ForceAtlas2 layout,
// community-based coloring, and hover/click interactions.

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Search, X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildGraphData, type GraphNode } from "@/lib/graph-builder";
import type { TreeItem, ArchitectureAnalysis } from "@/types";

interface KnowledgeGraphProps {
    tree: TreeItem[];
    analysis?: ArchitectureAnalysis | null;
    owner: string;
    repo: string;
}

export default function KnowledgeGraph({
    tree,
    analysis,
    owner,
    repo,
}: KnowledgeGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const draggedNodeRef = useRef<GraphNode | null>(null);
    const nodeDragStartRef = useRef({ x: 0, y: 0 });
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Build graph data
    const graphData = useMemo(() => {
        return buildGraphData(tree, analysis || undefined, owner, repo);
    }, [tree, analysis, owner, repo]);

    // Positioned nodes — start with circular layout, settle via deferred simulation
    const [positionedNodes, setPositionedNodes] = useState<GraphNode[]>([]);

    useEffect(() => {
        // Shallow-copy nodes so mutation doesn't affect graphData
        const nodes = graphData.nodes.map(n => ({ ...n }));
        const nodeCount = nodes.length;

        if (nodeCount === 0) {
            setPositionedNodes([]);
            return;
        }

        // Immediately place nodes in a circle so the canvas has something to render
        nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / nodeCount;
            const radius = Math.min(300, nodeCount * 3);
            node.x = Math.cos(angle) * radius;
            node.y = Math.sin(angle) * radius;
        });
        setPositionedNodes([...nodes]);

        // Run the full force simulation in a deferred macrotask so it never blocks paint
        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled) return;
            const edges = graphData.edges;
            const nodeMap = new Map(nodes.map(n => [n.id, n]));

            for (let iter = 0; iter < 80; iter++) {
                const temp = 1 - iter / 80;

                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const dx = (nodes[j].x || 0) - (nodes[i].x || 0);
                        const dy = (nodes[j].y || 0) - (nodes[i].y || 0);
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const repForce = (150 * temp) / dist;
                        const fx = (dx / dist) * repForce;
                        const fy = (dy / dist) * repForce;
                        nodes[i].x = (nodes[i].x || 0) - fx;
                        nodes[i].y = (nodes[i].y || 0) - fy;
                        nodes[j].x = (nodes[j].x || 0) + fx;
                        nodes[j].y = (nodes[j].y || 0) + fy;
                    }
                }

                edges.forEach(edge => {
                    const source = nodeMap.get(edge.source);
                    const target = nodeMap.get(edge.target);
                    if (!source || !target) return;
                    const dx = (target.x || 0) - (source.x || 0);
                    const dy = (target.y || 0) - (source.y || 0);
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const attForce = dist * 0.01 * temp;
                    const fx = (dx / dist) * attForce;
                    const fy = (dy / dist) * attForce;
                    source.x = (source.x || 0) + fx;
                    source.y = (source.y || 0) + fy;
                    target.x = (target.x || 0) - fx;
                    target.y = (target.y || 0) - fy;
                });

                nodes.forEach(n1 => {
                    if (n1.cluster === undefined) return;
                    nodes.forEach(n2 => {
                        if (n1 === n2 || n2.cluster !== n1.cluster) return;
                        const dx = (n2.x || 0) - (n1.x || 0);
                        const dy = (n2.y || 0) - (n1.y || 0);
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const force = dist * 0.002 * temp;
                        n1.x = (n1.x || 0) + (dx / dist) * force;
                        n1.y = (n1.y || 0) + (dy / dist) * force;
                    });
                });
            }

            setPositionedNodes([...nodes]);
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [graphData]);

    // Filter by search
    const filteredNodes = useMemo(() => {
        if (!searchQuery) return positionedNodes;
        const q = searchQuery.toLowerCase();
        return positionedNodes.filter(
            n =>
                n.label.toLowerCase().includes(q) ||
                n.path.toLowerCase().includes(q) ||
                n.module?.toLowerCase().includes(q)
        );
    }, [positionedNodes, searchQuery]);

    const highlightedIds = useMemo(() => {
        return new Set(filteredNodes.map(n => n.id));
    }, [filteredNodes]);

    // Canvas rendering
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const cx = w / 2 + offset.x;
        const cy = h / 2 + offset.y;

        // Clear
        ctx.fillStyle = "#0a0612";
        ctx.fillRect(0, 0, w, h);

        // Draw subtle grid
        ctx.strokeStyle = "rgba(124, 58, 237, 0.03)";
        ctx.lineWidth = 1;
        const gridSize = 40 * zoom;
        for (let x = (cx % gridSize); x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = (cy % gridSize); y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw edges
        graphData.edges.forEach(edge => {
            const sourceNode = positionedNodes.find(n => n.id === edge.source);
            const targetNode = positionedNodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return;

            const sx = cx + (sourceNode.x || 0) * zoom;
            const sy = cy + (sourceNode.y || 0) * zoom;
            const tx = cx + (targetNode.x || 0) * zoom;
            const ty = cy + (targetNode.y || 0) * zoom;

            const isHighlighted =
                searchQuery &&
                (highlightedIds.has(edge.source) || highlightedIds.has(edge.target));

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
            ctx.strokeStyle = isHighlighted
                ? "rgba(124, 58, 237, 0.4)"
                : edge.type === "dataflow"
                    ? "rgba(6, 182, 212, 0.15)"
                    : edge.type === "depends"
                        ? "rgba(168, 85, 247, 0.15)"
                        : "rgba(75, 85, 99, 0.08)";
            ctx.lineWidth = edge.type === "contains" ? 0.5 : 1;
            ctx.stroke();
        });

        // Draw nodes
        positionedNodes.forEach(node => {
            const x = cx + (node.x || 0) * zoom;
            const y = cy + (node.y || 0) * zoom;

            // Skip if off-screen
            if (x < -50 || x > w + 50 || y < -50 || y > h + 50) return;

            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const isFiltered = searchQuery && !highlightedIds.has(node.id);

            let radius: number;
            switch (node.type) {
                case "root": radius = 12 * zoom; break;
                case "module": radius = 8 * zoom; break;
                case "folder": radius = 4 * zoom; break;
                case "file": radius = 2.5 * zoom; break;
                default: radius = 3 * zoom;
            }

            // Centrality boost
            if (node.centrality && node.centrality > 5) {
                radius *= 1 + Math.min(node.centrality * 0.05, 1);
            }

            const alpha = isFiltered ? 0.1 : isHovered || isSelected ? 1 : 0.7;
            const color = node.color || "#6b7280";

            // Glow for hovered/selected
            if (isHovered || isSelected) {
                ctx.beginPath();
                ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
                ctx.fillStyle = color + "30";
                ctx.fill();
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Label for large/hovered nodes
            if ((zoom > 0.8 && (node.type === "module" || node.type === "root")) || isHovered) {
                ctx.fillStyle = isFiltered
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.8)";
                ctx.font = `${Math.max(10, 11 * zoom)}px Inter, system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText(node.label, x, y + radius + 14);
            }
        });

    }, [positionedNodes, graphData.edges, zoom, offset, hoveredNode, selectedNode, searchQuery, highlightedIds]);

    // Render loop
    useEffect(() => {
        renderCanvas();
    }, [renderCanvas]);

    // Mouse interactions
    const getNodeAtPosition = useCallback(
        (clientX: number, clientY: number): GraphNode | null => {
            const canvas = canvasRef.current;
            if (!canvas) return null;

            const rect = canvas.getBoundingClientRect();
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            const cx = canvas.clientWidth / 2 + offset.x;
            const cy = canvas.clientHeight / 2 + offset.y;
            // Convert mouse pixel coordinates to graph coordinate space
            const graphX = (mx - cx) / zoom;
            const graphY = (my - cy) / zoom;

            let closest: GraphNode | null = null;
            let closestDist = Infinity;

            positionedNodes.forEach((node: GraphNode) => {
                const nx = node.x || 0;
                const ny = node.y || 0;
                const dist = Math.sqrt((graphX - nx) ** 2 + (graphY - ny) ** 2);

                // Base radius in graph space
                let hitRadius: number;
                switch (node.type) {
                    case "root": hitRadius = 15; break;
                    case "module": hitRadius = 10; break;
                    case "folder": hitRadius = 6; break;
                    case "file": hitRadius = 4; break;
                    default: hitRadius = 5;
                }

                // Add centrality boost (needs to match renderCanvas)
                if (node.centrality && node.centrality > 5) {
                    hitRadius *= 1 + Math.min(node.centrality * 0.05, 1);
                }

                // Add a generosity buffer (larger when zoomed out)
                const generosity = 5 / zoom;

                if (dist < (hitRadius + generosity) && dist < closestDist) {
                    closest = node;
                    closestDist = dist;
                }
            });

            return closest;
        },
        [positionedNodes, zoom, offset]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            const draggedNode = draggedNodeRef.current;
            if (draggedNode) {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                const cx = canvas.clientWidth / 2 + offset.x;
                const cy = canvas.clientHeight / 2 + offset.y;

                draggedNode.x = (mx - cx) / zoom;
                draggedNode.y = (my - cy) / zoom;

                renderCanvas();
                return;
            }

            if (isDragging) {
                setOffset({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y,
                });
                return;
            }
            const node = getNodeAtPosition(e.clientX, e.clientY);
            setHoveredNode(node);
            if (canvasRef.current) {
                canvasRef.current.style.cursor = node ? "grab" : "default";
            }
        },
        [isDragging, dragStart, zoom, offset, renderCanvas, getNodeAtPosition]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            const node = getNodeAtPosition(e.clientX, e.clientY);
            if (node) {
                draggedNodeRef.current = node;
                nodeDragStartRef.current = { x: e.clientX, y: e.clientY };
                if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
            } else {
                setIsDragging(true);
                setDragStart({
                    x: e.clientX - offset.x,
                    y: e.clientY - offset.y,
                });
                if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
            }
        },
        [offset, getNodeAtPosition]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent) => {
            if (canvasRef.current) canvasRef.current.style.cursor = "default";

            const draggedNode = draggedNodeRef.current;
            if (draggedNode) {
                const dx = e.clientX - nodeDragStartRef.current.x;
                const dy = e.clientY - nodeDragStartRef.current.y;
                if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
                    setSelectedNode(prev => (prev?.id === draggedNode.id ? null : draggedNode));
                }
                draggedNodeRef.current = null;
                return;
            }

            if (!isDragging) return;
            setIsDragging(false);

            // If barely moved, treat as click
            const dx = e.clientX - (dragStart.x + offset.x);
            const dy = e.clientY - (dragStart.y + offset.y);
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
                const node = getNodeAtPosition(e.clientX, e.clientY);
                setSelectedNode(prev => (prev?.id === node?.id ? null : node || null));
            }
        },
        [isDragging, dragStart, offset, getNodeAtPosition]
    );

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(prev => {
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            return Math.max(0.1, Math.min(5, prev + delta));
        });
    }, []);

    const resetView = () => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    };

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#0a0612]">
            {/* Search Bar */}
            <div className="absolute top-4 left-4 z-10 w-72">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Search files, modules..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 pr-8 bg-gray-900/90 border-gray-700/50 backdrop-blur-sm text-sm placeholder:text-gray-600"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {searchQuery && (
                    <div className="mt-1 px-2 py-1 bg-gray-900/80 rounded-md backdrop-blur-sm">
                        <span className="text-xs text-gray-500">
                            {filteredNodes.length} / {positionedNodes.length} nodes
                        </span>
                    </div>
                )}
            </div>

            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZoom(z => Math.min(5, z + 0.2))}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={resetView}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Stats badge */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
                <Badge variant="outline" className="bg-gray-900/80 border-gray-700 backdrop-blur-sm">
                    {graphData.stats.totalFiles} files
                </Badge>
                <Badge variant="outline" className="bg-gray-900/80 border-gray-700 backdrop-blur-sm">
                    {graphData.stats.totalEdges} edges
                </Badge>
                <Badge variant="outline" className="bg-gray-900/80 border-gray-700 backdrop-blur-sm">
                    {graphData.stats.totalClusters} clusters
                </Badge>
                <Badge variant="outline" className="bg-gray-900/80 border-gray-700 backdrop-blur-sm">
                    {Math.round(zoom * 100)}%
                </Badge>
            </div>

            {/* Selected Node Panel */}
            {selectedNode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-96 bg-gray-900/95 border border-gray-700/50 rounded-xl p-4 backdrop-blur-xl shadow-2xl shadow-violet-500/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: selectedNode.color }}
                            />
                            <h3 className="text-sm font-semibold text-white">
                                {selectedNode.label}
                            </h3>
                        </div>
                        <button
                            onClick={() => setSelectedNode(null)}
                            className="text-gray-500 hover:text-gray-300"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-400">{selectedNode.path}</p>
                        {selectedNode.module && (
                            <Badge variant="outline" className="text-xs">
                                {selectedNode.module}
                            </Badge>
                        )}
                        {selectedNode.extension && (
                            <Badge variant="outline" className="text-xs ml-1">
                                .{selectedNode.extension}
                            </Badge>
                        )}
                        {selectedNode.centrality !== undefined && selectedNode.centrality > 0 && (
                            <p className="text-xs text-gray-500">
                                {selectedNode.centrality} connections
                            </p>
                        )}
                    </div>
                    {selectedNode.type === "file" && (
                        <a
                            href={`https://github.com/${owner}/${repo}/blob/HEAD/${selectedNode.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 block text-xs text-violet-400 hover:text-violet-300 underline"
                        >
                            View on GitHub →
                        </a>
                    )}
                </div>
            )}

            {/* Cluster Legend */}
            {graphData.clusters.length > 0 && (
                <div className="absolute bottom-4 right-4 z-10 bg-gray-900/90 border border-gray-700/50 rounded-lg p-3 backdrop-blur-sm max-w-48">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                        Clusters
                    </h4>
                    <ScrollArea className="max-h-32">
                        <div className="space-y-1">
                            {graphData.clusters.slice(0, 8).map(cluster => (
                                <div key={cluster.id} className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: cluster.color }}
                                    />
                                    <span className="text-xs text-gray-400 truncate">
                                        {cluster.label}
                                    </span>
                                    <span className="text-xs text-gray-600 ml-auto">
                                        {cluster.fileCount}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="h-full w-full"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    setIsDragging(false);
                    draggedNodeRef.current = null;
                    setHoveredNode(null);
                }}
                onWheel={handleWheel}
            />
        </div>
    );
}
