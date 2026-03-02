"use client";

import { useMemo } from "react";
import { type Node, type Edge } from "@xyflow/react";
import FlowWrapper from "./flow-wrapper";
import ContributorNode from "./nodes/contributor-node";
import { getLayoutedElements } from "@/lib/dagre-layout";
import type { Contributor, ContributorNodeData } from "@/types";

const nodeTypes = { contributor: ContributorNode };

interface ContributorsNetworkProps {
    contributors: Contributor[];
}

export default function ContributorsNetwork({
    contributors,
}: ContributorsNetworkProps) {
    if (contributors.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">👥</div>
                    <p className="text-sm text-gray-400">
                        No contributor data available.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Try adding a GitHub Personal Access Token for private repos.
                    </p>
                </div>
            </div>
        );
    }

    const { nodes, edges } = useMemo(() => {
        const rawNodes: Node[] = contributors.map((c, i) => ({
            id: c.login,
            type: "contributor",
            position: { x: 0, y: 0 },
            data: {
                login: c.login,
                avatarUrl: c.avatarUrl,
                contributions: c.contributions,
                htmlUrl: c.htmlUrl,
                color: "rgba(34, 211, 238, 0.5)",
            } satisfies ContributorNodeData & { color: string },
        }));

        // Create edges between contributors based on contribution similarity
        // (approximation: connect top contributors to each other)
        const rawEdges: Edge[] = [];
        const topContributors = contributors.slice(0, 15);

        for (let i = 0; i < topContributors.length; i++) {
            for (let j = i + 1; j < topContributors.length; j++) {
                // Connect contributors with similar contribution levels
                const ratio = Math.min(
                    topContributors[i].contributions,
                    topContributors[j].contributions
                ) /
                    Math.max(
                        topContributors[i].contributions,
                        topContributors[j].contributions
                    );

                if (ratio > 0.2 || (i < 5 && j < 5)) {
                    const sharedFiles = Math.floor(ratio * 20);
                    rawEdges.push({
                        id: `${topContributors[i].login}-${topContributors[j].login}`,
                        source: topContributors[i].login,
                        target: topContributors[j].login,
                        style: {
                            stroke: "rgba(34, 211, 238, 0.15)",
                            strokeWidth: Math.max(1, Math.min(sharedFiles / 4, 4)),
                        },
                    });
                }
            }
        }

        return getLayoutedElements(rawNodes, rawEdges, {
            direction: "TB",
            nodeWidth: 120,
            nodeHeight: 100,
            rankSep: 120,
            nodeSep: 80,
        });
    }, [contributors]);

    return (
        <FlowWrapper
            initialNodes={nodes}
            initialEdges={edges}
            nodeTypes={nodeTypes}
        />
    );
}
