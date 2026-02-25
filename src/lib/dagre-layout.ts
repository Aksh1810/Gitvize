// ============================================================================
// GitViz — Dagre Layout Utility
// ============================================================================

import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";

export type LayoutDirection = "TB" | "LR";

interface LayoutOptions {
    direction?: LayoutDirection;
    nodeWidth?: number;
    nodeHeight?: number;
    rankSep?: number;
    nodeSep?: number;
}

export function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    const {
        direction = "TB",
        nodeWidth = 250,
        nodeHeight = 80,
        rankSep = 80,
        nodeSep = 40,
    } = options;

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: direction,
        ranksep: rankSep,
        nodesep: nodeSep,
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, {
            width: node.measured?.width ?? nodeWidth,
            height: node.measured?.height ?? nodeHeight,
        });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const w = node.measured?.width ?? nodeWidth;
        const h = node.measured?.height ?? nodeHeight;

        return {
            ...node,
            position: {
                x: nodeWithPosition.x - w / 2,
                y: nodeWithPosition.y - h / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}
