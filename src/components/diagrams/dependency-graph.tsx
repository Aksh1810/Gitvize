"use client";

import { useMemo, useState, useCallback } from "react";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import { Package, X } from "lucide-react";
import FlowWrapper from "./flow-wrapper";
import DependencyNode from "./nodes/dependency-node";
import { getLayoutedElements } from "@/lib/dagre-layout";
import type { DependencyNodeData } from "@/types";
import type { ParsedDependency } from "@/lib/dep-parser";

const nodeTypes = { dependency: DependencyNode };

interface DependencyGraphProps {
    dependencies: ParsedDependency[];
    projectName: string;
}

export default function DependencyGraph({
    dependencies,
    projectName,
}: DependencyGraphProps) {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const depByName = useMemo(() => {
        const next = new Map<string, ParsedDependency>();
        dependencies.forEach((dep) => {
            next.set(dep.name, dep);
        });
        return next;
    }, [dependencies]);

    const baseGraph = useMemo(() => {
        const rawNodes: Node[] = [];
        const rawEdges: Edge[] = [];

        // Root project node
        rawNodes.push({
            id: "project",
            type: "dependency",
            position: { x: 0, y: 0 },
            data: {
                name: projectName,
                version: "",
                isDirect: true,
                dependentCount: dependencies.length,
                role: "project",
                color: "#6366f1",
            } satisfies DependencyNodeData & { color: string },
        });

        // Group dependencies by direct vs dev
        const directDeps = dependencies.filter((d) => d.isDirect);
        const devDeps = dependencies.filter((d) => !d.isDirect);

        // Create group nodes if both types exist
        const hasGroups = directDeps.length > 0 && devDeps.length > 0;

        if (hasGroups) {
            // "Dependencies" group node
            rawNodes.push({
                id: "group:direct",
                type: "dependency",
                position: { x: 0, y: 0 },
                data: {
                    name: `Dependencies (${directDeps.length})`,
                    version: "",
                    isDirect: true,
                    dependentCount: directDeps.length,
                    role: "group",
                    color: "#6366f1",
                } satisfies DependencyNodeData & { color: string },
            });
            rawEdges.push({
                id: "edge:project-direct",
                source: "project",
                target: "group:direct",
                style: { stroke: "rgba(99, 102, 241, 0.4)", strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(99, 102, 241, 0.5)" },
            });

            // "Dev Dependencies" group node
            rawNodes.push({
                id: "group:dev",
                type: "dependency",
                position: { x: 0, y: 0 },
                data: {
                    name: `Dev Dependencies (${devDeps.length})`,
                    version: "",
                    isDirect: false,
                    dependentCount: devDeps.length,
                    role: "group",
                    color: "#a855f7",
                } satisfies DependencyNodeData & { color: string },
            });
            rawEdges.push({
                id: "edge:project-dev",
                source: "project",
                target: "group:dev",
                style: { stroke: "rgba(148, 163, 184, 0.3)", strokeWidth: 1.5, strokeDasharray: "5,5" },
                markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(148, 163, 184, 0.3)" },
            });
        }

        // Add individual deps — limit per group for readability
        const maxDirect = 40;
        const maxDev = 30;

        const addDeps = (deps: ParsedDependency[], parentId: string, max: number) => {
            deps.slice(0, max).forEach((dep) => {
                rawNodes.push({
                    id: `dep:${dep.name}`,
                    type: "dependency",
                    position: { x: 0, y: 0 },
                    data: {
                        name: dep.name,
                        version: dep.version,
                        isDirect: dep.isDirect,
                        dependentCount: 1,
                        role: "dependency",
                        color: dep.isDirect ? "#6366f1" : "#a855f7",
                    } satisfies DependencyNodeData & { color: string },
                });

                rawEdges.push({
                    id: `edge:${parentId}-${dep.name}`,
                    source: parentId,
                    target: `dep:${dep.name}`,
                    style: {
                        stroke: dep.isDirect
                            ? "rgba(99, 102, 241, 0.25)"
                            : "rgba(148, 163, 184, 0.12)",
                        strokeWidth: 1,
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: dep.isDirect
                            ? "rgba(99, 102, 241, 0.4)"
                            : "rgba(148, 163, 184, 0.25)",
                    },
                });
            });
        };

        if (hasGroups) {
            addDeps(directDeps, "group:direct", maxDirect);
            addDeps(devDeps, "group:dev", maxDev);
        } else {
            // All deps are the same type, connect directly to project
            addDeps(dependencies, "project", 60);
        }

        const layouted = getLayoutedElements(rawNodes, rawEdges, {
            direction: "LR",
            nodeWidth: 240,
            nodeHeight: 60,
            rankSep: 150,
            nodeSep: 50,
        });

        const nodeMap = new Map<string, Node>();
        layouted.nodes.forEach((node) => nodeMap.set(node.id, node));

        const adjacency = new Map<string, Set<string>>();
        layouted.edges.forEach((edge) => {
            if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
            if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
            adjacency.get(edge.source)!.add(edge.target);
            adjacency.get(edge.target)!.add(edge.source);
        });

        return {
            nodes: layouted.nodes,
            edges: layouted.edges,
            nodeMap,
            adjacency,
        };
    }, [dependencies, projectName]);

    const focusedNodeIds = useMemo(() => {
        if (!selectedNodeId) return null;
        const related = new Set<string>([selectedNodeId]);
        const neighbors = baseGraph.adjacency.get(selectedNodeId);
        if (neighbors) {
            neighbors.forEach((id) => related.add(id));
        }
        return related;
    }, [baseGraph.adjacency, selectedNodeId]);

    const nodes = useMemo(() => {
        if (!focusedNodeIds || !selectedNodeId) return baseGraph.nodes;

        return baseGraph.nodes.map((node) => {
            const data = (node.data ?? {}) as unknown as DependencyNodeData & { color?: string };
            return {
                ...node,
                data: {
                    ...data,
                    isSelected: node.id === selectedNodeId,
                    isDimmed: !focusedNodeIds.has(node.id),
                },
            };
        });
    }, [baseGraph.nodes, focusedNodeIds, selectedNodeId]);

    const edges = useMemo(() => {
        if (!focusedNodeIds || !selectedNodeId) return baseGraph.edges;

        return baseGraph.edges.map((edge) => {
            const isConnectedToSelection = edge.source === selectedNodeId || edge.target === selectedNodeId;
            const bothFocused = focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target);

            return {
                ...edge,
                style: {
                    ...(edge.style ?? {}),
                    opacity: bothFocused ? (isConnectedToSelection ? 0.95 : 0.5) : 0.08,
                    strokeWidth: isConnectedToSelection ? 2 : (edge.style?.strokeWidth as number | undefined) ?? 1,
                },
            };
        });
    }, [baseGraph.edges, focusedNodeIds, selectedNodeId]);

    const selectedNode = selectedNodeId ? baseGraph.nodeMap.get(selectedNodeId) ?? null : null;

    const relatedNodeIds = useMemo(() => {
        if (!selectedNodeId) return [] as string[];
        return Array.from(baseGraph.adjacency.get(selectedNodeId) ?? []);
    }, [baseGraph.adjacency, selectedNodeId]);

    const relatedNodes = useMemo(() => {
        return relatedNodeIds
            .map((id) => baseGraph.nodeMap.get(id))
            .filter((node): node is Node => Boolean(node));
    }, [baseGraph.nodeMap, relatedNodeIds]);

    const selectedDependency = useMemo(() => {
        if (!selectedNodeId?.startsWith("dep:")) return null;
        return depByName.get(selectedNodeId.replace("dep:", "")) ?? null;
    }, [depByName, selectedNodeId]);

    const selectedNodeData = useMemo(() => {
        if (!selectedNode) return null;
        return (selectedNode.data ?? null) as unknown as DependencyNodeData | null;
    }, [selectedNode]);

    const importPathHints = useMemo(() => {
        if (!selectedDependency) return [] as string[];
        const base = selectedDependency.name;
        if (base.includes("/")) {
            return [base];
        }
        return [base, `${base}/...`];
    }, [selectedDependency]);

    const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    if (dependencies.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">📦</div>
                    <p className="text-sm text-gray-400">
                        No dependency data found.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        This repo may not have a recognized manifest file (package.json, requirements.txt, etc.)
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex gap-3">
            <div className="relative flex-1 min-w-0">
                <FlowWrapper
                    initialNodes={nodes}
                    initialEdges={edges}
                    nodeTypes={nodeTypes}
                    onNodeClick={handleNodeClick}
                    onPaneClick={clearSelection}
                />
            </div>

            <aside
                className={`h-full overflow-hidden transition-all duration-300 ${selectedNode ? "w-[320px] opacity-100" : "w-0 opacity-0"}`}
                aria-hidden={!selectedNode}
            >
                {selectedNode && (
                    <div className="h-full rounded-2xl border border-border/30 bg-[#070b15]/95 backdrop-blur-xl p-4 flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-slate-400">Dependency Details</p>
                                <h3 className="text-sm font-semibold text-slate-100 mt-1 truncate">
                                    {String(selectedNodeData?.name ?? selectedNode.id)}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="rounded-md p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
                                aria-label="Close details"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 space-y-1.5">
                            <p className="text-[11px] text-slate-400">Package metadata</p>
                            <div className="text-xs text-slate-200 flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-indigo-300" />
                                <span className="truncate">{String(selectedNodeData?.name ?? selectedNode.id)}</span>
                            </div>
                            <p className="text-xs text-slate-300">Version: {selectedDependency?.version ?? "n/a"}</p>
                            <p className="text-xs text-slate-300">
                                Type: {selectedDependency ? (selectedDependency.isDirect ? "Direct dependency" : "Dev dependency") : "Group / project node"}
                            </p>
                        </div>

                        <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
                            <p className="text-[11px] text-slate-400 mb-2">Dependents (related in current graph)</p>
                            {relatedNodes.length > 0 ? (
                                <div className="space-y-1.5 max-h-36 overflow-auto pr-1">
                                    {relatedNodes.map((node) => {
                                        const nodeData = ((node.data ?? null) as unknown as DependencyNodeData | null) ?? { name: node.id, isDirect: true, dependentCount: 0 };
                                        return (
                                            <button
                                                key={node.id}
                                                type="button"
                                                onClick={() => setSelectedNodeId(node.id)}
                                                className="w-full rounded-md border border-slate-700/70 bg-slate-800/70 px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-700/70"
                                            >
                                                {nodeData.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">No related nodes in current view.</p>
                            )}
                        </div>

                        <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
                            <p className="text-[11px] text-slate-400 mb-2">Import paths</p>
                            {importPathHints.length > 0 ? (
                                <div className="space-y-1">
                                    {importPathHints.map((path) => (
                                        <div key={path} className="rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-200 font-mono">
                                            {path}
                                        </div>
                                    ))}
                                    <p className="text-[11px] text-slate-500">Detailed file-level import paths will be indexed in a later update.</p>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">Select a package node to view import path hints.</p>
                            )}
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
