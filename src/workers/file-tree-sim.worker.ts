import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    type Simulation,
} from "d3-force";
import {
    d3ChargeFor,
    d3LinkDistance,
    type PhysicsLink,
    type PhysicsNode,
    type SimMessageLink,
    type SimMessageNode,
} from "@/lib/file-tree-physics";

type IncomingNode = SimMessageNode;
type IncomingLink = SimMessageLink;

type InitMessage = {
    type: "init";
    epoch: number;
    nodes: IncomingNode[];
    links: IncomingLink[];
    settleMs: number;
};
type ReheatMessage = {
    type: "reheat";
    epoch: number;
    nodes: IncomingNode[];
    links: IncomingLink[];
    settleMs: number;
};
type DragStartMessage = { type: "dragStart"; id: string };
type DragMoveMessage = { type: "dragMove"; id: string; x: number; y: number };
type DragEndMessage = { type: "dragEnd"; id: string };
type StopMessage = { type: "stop" };

type WorkerInput =
    | InitMessage
    | ReheatMessage
    | DragStartMessage
    | DragMoveMessage
    | DragEndMessage
    | StopMessage;

type WorkerOutput =
    | { type: "ready"; epoch: number; ids: string[] }
    | { type: "tick"; epoch: number; positions: Float32Array }
    | { type: "settled"; epoch: number };

const TICK_INTERVAL_MS = 16;

let currentEpoch = -1;
let sim: Simulation<PhysicsNode, PhysicsLink> | null = null;
let nodes: PhysicsNode[] = [];
let nodeMap = new Map<string, PhysicsNode>();
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isSettled = false;

function buildNodes(
    incoming: IncomingNode[],
    preserve: Map<string, PhysicsNode> | undefined,
): { nodes: PhysicsNode[]; map: Map<string, PhysicsNode> } {
    const out: PhysicsNode[] = [];
    const map = new Map<string, PhysicsNode>();
    for (const inc of incoming) {
        const old = preserve?.get(inc.id);
        if (old) {
            old.nodeType = inc.nodeType;
            old.size = inc.size;
            out.push(old);
            map.set(inc.id, old);
        } else {
            const node: PhysicsNode = {
                id: inc.id,
                nodeType: inc.nodeType,
                size: inc.size,
                x: inc.x ?? 0,
                y: inc.y ?? 0,
            };
            out.push(node);
            map.set(inc.id, node);
        }
    }
    return { nodes: out, map };
}

function buildLinks(
    incoming: IncomingLink[],
    map: Map<string, PhysicsNode>,
): PhysicsLink[] {
    const links: PhysicsLink[] = [];
    for (const link of incoming) {
        const source = map.get(link.source);
        const target = map.get(link.target);
        if (source && target) {
            links.push({ source, target, edgeType: link.edgeType });
        }
    }
    return links;
}

function postPositions() {
    if (!sim || currentEpoch < 0) return;
    const buf = new Float32Array(nodes.length * 2);
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        buf[i * 2] = n.x ?? 0;
        buf[i * 2 + 1] = n.y ?? 0;
    }
    const msg: WorkerOutput = { type: "tick", epoch: currentEpoch, positions: buf };
    (self as unknown as Worker).postMessage(msg, [buf.buffer]);
}

function tick() {
    if (!sim) return;
    sim.tick();
    postPositions();
}

function clearTimers() {
    if (tickIntervalId !== null) {
        clearInterval(tickIntervalId);
        tickIntervalId = null;
    }
    if (settleTimeoutId !== null) {
        clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
    }
}

function startSimulation(msg: InitMessage | ReheatMessage, isReheat: boolean) {
    const preserve = isReheat ? nodeMap : undefined;
    const built = buildNodes(msg.nodes, preserve);
    nodes = built.nodes;
    nodeMap = built.map;
    const links = buildLinks(msg.links, nodeMap);

    if (sim && isReheat) {
        sim.nodes(nodes);
        sim.force(
            "charge",
            forceManyBody<PhysicsNode>().strength((n) => d3ChargeFor(n.nodeType)),
        );
        sim.force(
            "link",
            forceLink<PhysicsNode, PhysicsLink>(links)
                .id((n) => n.id)
                .distance((l) => d3LinkDistance((l as PhysicsLink).edgeType))
                .strength(0.4),
        );
        sim.force(
            "collision",
            forceCollide<PhysicsNode>().radius((n) => n.size + 3).strength(0.7),
        );
        sim.alpha(Math.max(sim.alpha(), 0.2)).alphaTarget(0.003);
    } else {
        sim?.stop();
        sim = forceSimulation<PhysicsNode>(nodes)
            .force(
                "charge",
                forceManyBody<PhysicsNode>().strength((n) => d3ChargeFor(n.nodeType)),
            )
            .force(
                "link",
                forceLink<PhysicsNode, PhysicsLink>(links)
                    .id((n) => n.id)
                    .distance((l) => d3LinkDistance((l as PhysicsLink).edgeType))
                    .strength(0.4),
            )
            .force("center", forceCenter(0, 0).strength(0.05))
            .force(
                "collision",
                forceCollide<PhysicsNode>().radius((n) => n.size + 3).strength(0.7),
            )
            .alphaDecay(0.01)
            .alphaTarget(0.003)
            .stop();
    }

    isSettled = false;

    clearTimers();
    const epochAtStart = currentEpoch;
    settleTimeoutId = setTimeout(() => {
        if (sim && currentEpoch === epochAtStart) {
            sim.alphaTarget(0.001);
            isSettled = true;
            const settledMsg: WorkerOutput = { type: "settled", epoch: currentEpoch };
            (self as unknown as Worker).postMessage(settledMsg);
        }
    }, msg.settleMs);

    tickIntervalId = setInterval(tick, TICK_INTERVAL_MS);

    const ready: WorkerOutput = {
        type: "ready",
        epoch: currentEpoch,
        ids: nodes.map((n) => n.id),
    };
    (self as unknown as Worker).postMessage(ready);
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const msg = e.data;
    switch (msg.type) {
        case "init": {
            currentEpoch = msg.epoch;
            startSimulation(msg, false);
            break;
        }
        case "reheat": {
            currentEpoch = msg.epoch;
            startSimulation(msg, true);
            break;
        }
        case "dragStart": {
            const node = nodeMap.get(msg.id);
            if (node && sim) {
                node.fx = node.x;
                node.fy = node.y;
                sim.alpha(Math.max(sim.alpha(), 0.3)).alphaTarget(0.3);
            }
            break;
        }
        case "dragMove": {
            const node = nodeMap.get(msg.id);
            if (node) {
                node.fx = msg.x;
                node.fy = msg.y;
            }
            break;
        }
        case "dragEnd": {
            const node = nodeMap.get(msg.id);
            if (node) {
                node.fx = undefined;
                node.fy = undefined;
            }
            if (sim) sim.alphaTarget(isSettled ? 0.001 : 0.003);
            break;
        }
        case "stop": {
            clearTimers();
            sim?.stop();
            sim = null;
            nodes = [];
            nodeMap = new Map();
            break;
        }
    }
};
