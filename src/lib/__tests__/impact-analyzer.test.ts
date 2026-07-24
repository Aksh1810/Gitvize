import { describe, expect, it } from "vitest";
import { analyzeImpact, findHubFiles } from "@/lib/impact-analyzer";
import type { GraphData } from "@/lib/graph-builder";

function makeGraph(edges: GraphData["edges"]): GraphData {
  return { nodes: [], edges, clusters: [], stats: { totalFiles: 0, totalFolders: 0, totalEdges: edges.length, totalClusters: 0, mostConnectedFiles: [] } };
}

describe("analyzeImpact", () => {
  it("computes direct and indirect dependents", () => {
    const graph = makeGraph([
      { source: "file:a.ts", target: "file:core.ts", type: "imports" },
      { source: "file:b.ts", target: "file:core.ts", type: "depends" },
      { source: "file:c.ts", target: "file:a.ts", type: "imports" },
      { source: "file:d.ts", target: "file:c.ts", type: "imports" },
    ]);

    const result = analyzeImpact("core.ts", graph);

    expect(result.directDependents.sort()).toEqual(["a.ts", "b.ts"]);
    expect(result.indirectDependents.sort()).toEqual(["c.ts", "d.ts"]);
    expect(result.totalImpact).toBe(4);
    expect(result.riskScore).toBe("medium");
  });

  it("returns low risk for files with no dependents", () => {
    const result = analyzeImpact("isolated.ts", makeGraph([]));

    expect(result.directDependents).toEqual([]);
    expect(result.indirectDependents).toEqual([]);
    expect(result.totalImpact).toBe(0);
    expect(result.riskScore).toBe("low");
  });

  it("applies risk score thresholds", () => {
    const mediumGraph = makeGraph(
      Array.from({ length: 5 }, (_, i) => ({
        source: `file:dep-${i}.ts`,
        target: "file:target.ts",
        type: "imports" as const,
      }))
    );
    const highGraph = makeGraph(
      Array.from({ length: 6 }, (_, i) => ({
        source: `file:dep-${i}.ts`,
        target: "file:target.ts",
        type: "imports" as const,
      }))
    );
    const criticalGraph = makeGraph(
      Array.from({ length: 21 }, (_, i) => ({
        source: `file:dep-${i}.ts`,
        target: "file:target.ts",
        type: "imports" as const,
      }))
    );

    expect(analyzeImpact("target.ts", mediumGraph).riskScore).toBe("medium");
    expect(analyzeImpact("target.ts", highGraph).riskScore).toBe("high");
    expect(analyzeImpact("target.ts", criticalGraph).riskScore).toBe("critical");
  });
});

describe("findHubFiles", () => {
  it("ranks files by inbound imports/depends", () => {
    const graph = makeGraph([
      { source: "file:a.ts", target: "file:core.ts", type: "imports" },
      { source: "file:b.ts", target: "file:core.ts", type: "depends" },
      { source: "file:c.ts", target: "file:helper.ts", type: "imports" },
      { source: "file:d.ts", target: "module:shared", type: "depends" },
      { source: "file:e.ts", target: "module:shared", type: "depends" },
      { source: "file:f.ts", target: "module:shared", type: "depends" },
    ]);

    expect(findHubFiles(graph, 2)).toEqual([
      { path: "shared", impact: 3 },
      { path: "core.ts", impact: 2 },
    ]);
  });
});
