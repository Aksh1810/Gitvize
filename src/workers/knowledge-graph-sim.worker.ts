interface SimNode {
    id: string;
    x: number;
    y: number;
    cluster?: number;
}

interface SimEdge {
    source: string;
    target: string;
}

interface WorkerInput {
    nodes: SimNode[];
    edges: SimEdge[];
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const { nodes, edges } = e.data;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (let iter = 0; iter < 80; iter++) {
        const temp = 1 - iter / 80;

        // Pairwise repulsion
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[j].x - nodes[i].x;
                const dy = nodes[j].y - nodes[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const repForce = (150 * temp) / dist;
                const fx = (dx / dist) * repForce;
                const fy = (dy / dist) * repForce;
                nodes[i].x -= fx;
                nodes[i].y -= fy;
                nodes[j].x += fx;
                nodes[j].y += fy;
            }
        }

        // Edge attraction
        for (const edge of edges) {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const attForce = dist * 0.01 * temp;
            const fx = (dx / dist) * attForce;
            const fy = (dy / dist) * attForce;
            source.x += fx;
            source.y += fy;
            target.x -= fx;
            target.y -= fy;
        }

        // Cluster cohesion
        for (const n1 of nodes) {
            if (n1.cluster === undefined) continue;
            for (const n2 of nodes) {
                if (n1 === n2 || n2.cluster !== n1.cluster) continue;
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = dist * 0.002 * temp;
                n1.x += (dx / dist) * force;
                n1.y += (dy / dist) * force;
            }
        }
    }

    self.postMessage({ nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })) });
};
