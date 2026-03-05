"use client";

import { useMemo, useState, useCallback } from "react";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import FlowWrapper from "./flow-wrapper";
import CommitNode from "./nodes/commit-node";
import type { Branch, Commit, CommitNodeData } from "@/types";
import { GitCommit, X, User, Calendar, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    const [selectedCommit, setSelectedCommit] = useState<CommitNodeData | null>(null);

    const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        const d = node.data as unknown as CommitNodeData;
        if (d.sha) {
            setSelectedCommit(d);
        }
    }, []);

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
        <div className="relative w-full h-full">
            <FlowWrapper
                initialNodes={nodes}
                initialEdges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitViewOptions={{ padding: 0.3, maxZoom: 2 }}
            />

            {/* Commit Info Panel */}
            {selectedCommit && (
                <div className="absolute top-4 right-4 z-20 w-[320px] bg-[#0a0e1a]/95 backdrop-blur-xl border border-border/30 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                        <div className="flex items-center gap-2">
                            <GitCommit className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-semibold">Commit Info</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7"
                            onClick={() => setSelectedCommit(null)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="px-4 py-3 space-y-3">
                        {/* SHA */}
                        <div>
                            <code className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded font-mono">
                                {selectedCommit.sha.substring(0, 7)}
                            </code>
                        </div>

                        {/* Message */}
                        <p className="text-sm text-foreground leading-relaxed">
                            {selectedCommit.message}
                        </p>

                        {/* Author */}
                        {selectedCommit.authorName && (
                            <div className="flex items-center gap-2">
                                {selectedCommit.authorAvatar ? (
                                    <img
                                        src={selectedCommit.authorAvatar}
                                        alt={selectedCommit.authorName}
                                        className="w-5 h-5 rounded-full"
                                    />
                                ) : (
                                    <User className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                    {selectedCommit.authorName}
                                </span>
                            </div>
                        )}

                        {/* Date */}
                        {selectedCommit.date && (
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                    {new Date(selectedCommit.date).toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* Branch */}
                        {selectedCommit.branch && (
                            <div className="flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-muted-foreground" />
                                <Badge variant="outline" className="text-[10px]">
                                    {selectedCommit.branch}
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

