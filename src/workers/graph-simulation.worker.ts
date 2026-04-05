import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceCollide,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
} from "d3-force";

interface WNode extends SimulationNodeDatum {
    id: string;
    radius: number;
}

interface WLink extends SimulationLinkDatum<WNode> {
    _source: string;
    _target: string;
}

interface WorkerInput {
    nodes: { id: string; radius: number }[];
    edges: { source: string; target: string }[];
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const { nodes, edges } = e.data;

    const simNodes: WNode[] = nodes.map((n) => ({
        ...n,
        x: (Math.random() - 0.5) * 800,
        y: (Math.random() - 0.5) * 800,
    }));

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks = edges
        .map((e) => ({
            _source: e.source,
            _target: e.target,
            source: nodeById.get(e.source)!,
            target: nodeById.get(e.target)!,
        }))
        .filter((l) => l.source && l.target) as WLink[];

    const sim = forceSimulation<WNode>(simNodes)
        .force("charge", forceManyBody<WNode>().strength(-120))
        .force(
            "link",
            forceLink<WNode, WLink>(simLinks)
                .id((d) => d.id)
                .distance(80)
                .strength(0.5)
        )
        .force("center", forceCenter(0, 0))
        .force("collide", forceCollide<WNode>().radius((d) => d.radius + 6))
        .alphaDecay(0.028)
        .velocityDecay(0.4)
        .stop();

    // Compute iterations needed to reach alphaMin
    const iters = Math.ceil(
        Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())
    );
    sim.tick(Math.min(iters, 300));

    self.postMessage({
        nodes: simNodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })),
    });
};
