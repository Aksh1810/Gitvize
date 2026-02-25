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
    const { nodes, edges } = useMemo(() => {
        // Count how many other deps each package has (simplified)
        const depCounts = new Map<string, number>();
        dependencies.forEach((d) => {
            depCounts.set(d.name, (depCounts.get(d.name) ?? 0) + 1);
        });

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

        // Limit to top 40 deps for readability
        const limitedDeps = dependencies.slice(0, 40);

        limitedDeps.forEach((dep) => {
            rawNodes.push({
                id: `dep:${dep.name}`,
                type: "dependency",
                position: { x: 0, y: 0 },
                data: {
                    name: dep.name,
                    version: dep.version,
                    isDirect: dep.isDirect,
                    dependentCount: depCounts.get(dep.name) ?? 1,
                    color: dep.isDirect ? "#6366f1" : "#64748b",
                } satisfies DependencyNodeData & { color: string },
            });

            rawEdges.push({
                id: `edge:project-${dep.name}`,
                source: "project",
                target: `dep:${dep.name}`,
                style: {
                    stroke: dep.isDirect
                        ? "rgba(99, 102, 241, 0.3)"
                        : "rgba(148, 163, 184, 0.15)",
                    strokeWidth: dep.isDirect ? 2 : 1,
                    strokeDasharray: dep.isDirect ? undefined : "5,5",
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: dep.isDirect
                        ? "rgba(99, 102, 241, 0.5)"
                        : "rgba(148, 163, 184, 0.3)",
                },
            });
        });

        return getLayoutedElements(rawNodes, rawEdges, {
            direction: "TB",
            nodeWidth: 150,
            nodeHeight: 70,
            rankSep: 80,
            nodeSep: 30,
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
