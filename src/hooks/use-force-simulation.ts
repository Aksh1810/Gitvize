"use client";

import { useEffect, useRef, useCallback } from "react";
import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceCollide,
    type Simulation,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
} from "d3-force";
import type { Node, Edge } from "@xyflow/react";

interface SimNode extends SimulationNodeDatum {
    id: string;
    radius: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
    id: string;
}

interface UseForceSimulationOptions {
    nodes: Node[];
    edges: Edge[];
    onTick: (positions: Map<string, { x: number; y: number }>) => void;
    onSettle?: () => void;
    positionSeed?: Map<string, { x: number; y: number }>;
}

export function useForceSimulation({
    nodes,
    edges,
    onTick,
    onSettle,
    positionSeed,
}: UseForceSimulationOptions) {
    const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
    const onTickRef = useRef(onTick);
    const onSettleRef = useRef(onSettle);
    const rafRef = useRef<number | null>(null);
    const settledRef = useRef(false);

    // Keep callbacks current without recreating simulation
    useEffect(() => { onTickRef.current = onTick; }, [onTick]);
    useEffect(() => { onSettleRef.current = onSettle; }, [onSettle]);

    // Recreate simulation only when node/edge count changes
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    useEffect(() => {
        if (nodeCount === 0) return;

        // Build sim nodes, seeding position from existing positions or seed map
        const simNodes: SimNode[] = nodes.map((n) => {
            const seeded = positionSeed?.get(n.id);
            const radius = (n.data?.radius as number | undefined) ?? 12;
            return {
                id: n.id,
                radius,
                x: seeded?.x ?? n.position.x,
                y: seeded?.y ?? n.position.y,
            };
        });

        const nodeById = new Map(simNodes.map((n) => [n.id, n]));

        const simLinks: SimLink[] = edges
            .map((e) => ({
                id: e.id,
                source: nodeById.get(e.source) ?? e.source,
                target: nodeById.get(e.target) ?? e.target,
            }))
            .filter(
                (l) =>
                    typeof l.source !== "string" && typeof l.target !== "string"
            ) as SimLink[];

        settledRef.current = false;

        const sim = forceSimulation<SimNode>(simNodes)
            .force("charge", forceManyBody<SimNode>().strength(-120))
            .force(
                "link",
                forceLink<SimNode, SimLink>(simLinks)
                    .id((d) => d.id)
                    .distance(80)
                    .strength(0.5)
            )
            .force("center", forceCenter(0, 0))
            .force(
                "collide",
                forceCollide<SimNode>().radius((d) => d.radius + 6)
            )
            .alphaDecay(0.028)
            .velocityDecay(0.4);

        sim.on("tick", () => {
            if (rafRef.current !== null) return; // already scheduled
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const positions = new Map<string, { x: number; y: number }>();
                sim.nodes().forEach((n) => {
                    if (n.x != null && n.y != null) {
                        positions.set(n.id, { x: n.x, y: n.y });
                    }
                });
                onTickRef.current(positions);
            });
        });

        sim.on("end", () => {
            if (!settledRef.current) {
                settledRef.current = true;
                onSettleRef.current?.();
            }
        });

        simRef.current = sim;

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            sim.stop();
            simRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeCount, edgeCount]);

    const pinNode = useCallback((id: string, x: number, y: number) => {
        const sim = simRef.current;
        if (!sim) return;
        const node = sim.nodes().find((n) => n.id === id);
        if (node) {
            node.fx = x;
            node.fy = y;
            sim.alphaTarget(0.3).restart();
        }
    }, []);

    const unpinNode = useCallback((id: string) => {
        const sim = simRef.current;
        if (!sim) return;
        const node = sim.nodes().find((n) => n.id === id);
        if (node) {
            node.fx = null;
            node.fy = null;
            sim.alphaTarget(0).restart();
        }
    }, []);

    const reheat = useCallback(() => {
        simRef.current?.alpha(0.3).restart();
        settledRef.current = false;
    }, []);

    return { pinNode, unpinNode, reheat, simRef };
}
