"use client";

import { useMemo } from "react";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import FlowWrapper from "./flow-wrapper";
import CommitNode from "./nodes/commit-node";
import type { Branch, Commit, CommitNodeData } from "@/types";

const nodeTypes = { commit: CommitNode };

const branchColors = [
    "#6366f1",
    "#22d3ee",
    "#a855f7",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#3b82f6",
];

function getBranchColor(branch: string, index: number): string {
    return branchColors[index % branchColors.length];
}

interface BranchGraphProps {
    branches: Branch[];
    commits: Commit[];
    defaultBranch: string;
}

export default function BranchGraph({
    branches,
    commits,
    defaultBranch,
}: BranchGraphProps) {
    const { nodes, edges } = useMemo(() => {
        const rawNodes: Node[] = [];
        const rawEdges: Edge[] = [];

        const defaultBranchIdx = branches.findIndex((b) => b.isDefault);
        const mainColor = branchColors[0];

        // Main branch commits as horizontal spine
        const mainCommits = commits.slice(0, 30);
        mainCommits.forEach((commit, i) => {
            rawNodes.push({
                id: `commit:${commit.sha}`,
                type: "commit",
                position: { x: i * 70, y: 200 },
                data: {
                    sha: commit.sha,
                    message: commit.message,
                    authorName: commit.authorName,
                    authorAvatar: commit.authorAvatar,
                    date: commit.date,
                    branch: defaultBranch,
                    color: mainColor,
                } satisfies CommitNodeData & { color: string },
            });

            if (i > 0) {
                rawEdges.push({
                    id: `edge:${mainCommits[i - 1].sha}-${commit.sha}`,
                    source: `commit:${mainCommits[i - 1].sha}`,
                    target: `commit:${commit.sha}`,
                    style: { stroke: mainColor, strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: mainColor },
                });
            }
        });

        // Branch labels as nodes diverging from the spine
        const nonDefaultBranches = branches.filter((b) => !b.isDefault).slice(0, 10);

        nonDefaultBranches.forEach((branch, bIdx) => {
            const color = getBranchColor(branch.name, bIdx + 1);
            const attachIdx = Math.min(bIdx * 3 + 2, mainCommits.length - 1);
            const yOffset = bIdx % 2 === 0 ? -120 : 120;

            // Branch label node
            const branchNodeId = `branch:${branch.name}`;
            rawNodes.push({
                id: branchNodeId,
                type: "commit",
                position: {
                    x: attachIdx * 70 + 35,
                    y: 200 + yOffset,
                },
                data: {
                    sha: branch.sha.substring(0, 7),
                    message: branch.name,
                    authorName: "",
                    authorAvatar: null,
                    date: "",
                    branch: branch.name,
                    color,
                } satisfies CommitNodeData & { color: string },
            });

            // Edge from main branch to feature branch
            if (mainCommits[attachIdx]) {
                rawEdges.push({
                    id: `edge:main-${branch.name}`,
                    source: `commit:${mainCommits[attachIdx].sha}`,
                    target: branchNodeId,
                    style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "5,5" },
                });
            }
        });

        // Default branch label
        rawNodes.push({
            id: "branch-label:default",
            type: "commit",
            position: { x: -80, y: 200 },
            data: {
                sha: "",
                message: defaultBranch,
                authorName: "",
                authorAvatar: null,
                date: "",
                branch: defaultBranch,
                color: mainColor,
            } satisfies CommitNodeData & { color: string },
        });

        if (mainCommits.length > 0) {
            rawEdges.push({
                id: "edge:label-first",
                source: "branch-label:default",
                target: `commit:${mainCommits[0].sha}`,
                style: { stroke: mainColor, strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: mainColor },
            });
        }

        return { nodes: rawNodes, edges: rawEdges };
    }, [branches, commits, defaultBranch]);

    return (
        <FlowWrapper
            initialNodes={nodes}
            initialEdges={edges}
            nodeTypes={nodeTypes}
            fitViewOptions={{ padding: 0.3, maxZoom: 2 }}
        />
    );
}
