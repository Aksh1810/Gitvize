// ============================================================================
// GitViz — Impact Analyzer (GitNexus-inspired blast radius analysis)
// ============================================================================
// Given a file, traces all upstream importers to calculate blast radius.

import type { TreeItem } from "@/types";
import type { GraphData, GraphEdge } from "./graph-builder";

export interface ImpactResult {
    targetFile: string;
    directDependents: string[];
    indirectDependents: string[];
    totalImpact: number;
    depthLevels: Map<number, string[]>;
    riskScore: "low" | "medium" | "high" | "critical";
}

/**
 * Trace all upstream files that depend on the given file.
 * Uses the "contains", "imports", and "depends" edges from the graph.
 */
export function analyzeImpact(
    targetPath: string,
    graphData: GraphData
): ImpactResult {
    const targetId = `file:${targetPath}`;
    const visited = new Set<string>();
    const depthLevels = new Map<number, string[]>();

    // BFS to find all dependents
    const queue: Array<{ id: string; depth: number }> = [{ id: targetId, depth: 0 }];

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        // Find all edges where this node is the target (i.e., something depends on it)
        const dependents = graphData.edges.filter(
            e => e.target === id && (e.type === "imports" || e.type === "depends")
        );

        dependents.forEach(edge => {
            if (!visited.has(edge.source)) {
                const level = depth + 1;
                if (!depthLevels.has(level)) {
                    depthLevels.set(level, []);
                }
                depthLevels.get(level)!.push(edge.source.replace(/^file:/, ""));
                queue.push({ id: edge.source, depth: level });
            }
        });
    }

    // Split into direct (depth 1) and indirect (depth > 1)
    const directDependents = depthLevels.get(1) || [];
    const indirectDependents: string[] = [];
    depthLevels.forEach((files, depth) => {
        if (depth > 1) indirectDependents.push(...files);
    });

    const totalImpact = directDependents.length + indirectDependents.length;

    // Risk scoring
    let riskScore: ImpactResult["riskScore"];
    if (totalImpact === 0) riskScore = "low";
    else if (totalImpact <= 5) riskScore = "medium";
    else if (totalImpact <= 20) riskScore = "high";
    else riskScore = "critical";

    return {
        targetFile: targetPath,
        directDependents,
        indirectDependents,
        totalImpact,
        depthLevels,
        riskScore,
    };
}

/**
 * Find the most impactful files in the codebase (hub files).
 */
export function findHubFiles(
    graphData: GraphData,
    topN: number = 10
): Array<{ path: string; impact: number }> {
    const impactMap = new Map<string, number>();

    graphData.edges.forEach(edge => {
        if (edge.type === "imports" || edge.type === "depends") {
            const targetPath = edge.target.replace(/^(file|module):/, "");
            impactMap.set(targetPath, (impactMap.get(targetPath) || 0) + 1);
        }
    });

    return Array.from(impactMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([path, impact]) => ({ path, impact }));
}
