"use client";

import { useMemo } from "react";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
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

    const { nodes, edges } = useMemo(() => {
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
                    color: "#64748b",
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
                        color: dep.isDirect ? "#6366f1" : "#64748b",
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

        return getLayoutedElements(rawNodes, rawEdges, {
            direction: "LR",
            nodeWidth: 200,
            nodeHeight: 60,
            rankSep: 150,
            nodeSep: 50,
        });
    }, [dependencies, projectName]);

    return (
        <FlowWrapper
            initialNodes={nodes}
            initialEdges={edges}
            nodeTypes={nodeTypes}
        />
    );
}
