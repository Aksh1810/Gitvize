import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

export type SimNodeType = "root" | "folder" | "file" | "symbol";

export interface PhysicsNode extends SimulationNodeDatum {
    id: string;
    nodeType: SimNodeType;
    size: number;
}

export interface PhysicsLink extends SimulationLinkDatum<PhysicsNode> {
    edgeType: string;
}

export function d3ChargeFor(nodeType: SimNodeType): number {
    switch (nodeType) {
        case "root":   return -1200;
        case "folder": return -600;
        case "file":   return -250;
        case "symbol": return -60;
        default:       return -150;
    }
}

export function d3LinkDistance(edgeType: string): number {
    switch (edgeType) {
        case "defines":    return 40;
        case "fileImport": return 100;
        case "contains":   return 120;
        default:           return 80;
    }
}

export function settleMsForCount(nodeCount: number): number {
    return nodeCount < 200 ? 3000 : nodeCount < 1000 ? 5000 : nodeCount < 3000 ? 7000 : 5000;
}

export function reheatSettleMsForCount(nodeCount: number): number {
    return nodeCount < 200 ? 2000 : nodeCount < 1000 ? 4000 : 5000;
}

export interface SimMessageNode {
    id: string;
    nodeType: SimNodeType;
    size: number;
    x?: number;
    y?: number;
}

export interface SimMessageLink {
    source: string;
    target: string;
    edgeType: string;
}
