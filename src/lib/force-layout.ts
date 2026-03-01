import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { Node, Edge } from "@xyflow/react";

export function getForceLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    options = { iterations: 100 }
) {
    if (nodes.length === 0) return { nodes, edges };

    const graph = new Graph({ multi: true });

    // Add nodes to graphology with initial random positions around center
    nodes.forEach((node, i) => {
        const radius = Math.min(300, nodes.length * 3);
        const angle = (2 * Math.PI * i) / nodes.length;

        let nodeSize = 25;
        if (node.id === "root" || node.data?.path === "") nodeSize = 100;
        else if (node.data?.type === "folder") nodeSize = 60;

        graph.addNode(node.id, {
            x: Math.cos(angle) * (radius + Math.random() * 50),
            y: Math.sin(angle) * (radius + Math.random() * 50),
            size: nodeSize,
        });
    });

    // Add edges
    edges.forEach((edge) => {
        // Prevent errors if nodes are missing
        if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
            graph.addEdge(edge.source, edge.target, {
                weight: 1
            });
        }
    });

    // Run ForceAtlas2
    const settings = forceAtlas2.inferSettings(graph);
    const positions = forceAtlas2(graph, {
        iterations: options.iterations,
        settings: {
            ...settings,
            gravity: 1.0,
            scalingRatio: 400, // Significantly spread out nodes to prevent overlapping
            strongGravityMode: false,
            barnesHutOptimize: nodes.length > 150,
            linLogMode: true, // Creates a more natural cluster
        },
    });

    // Map positions back to React Flow nodes
    const layoutedNodes = nodes.map((node) => {
        const pos = positions[node.id];
        return {
            ...node,
            position: {
                x: pos ? pos.x : 0,
                y: pos ? pos.y : 0,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}
