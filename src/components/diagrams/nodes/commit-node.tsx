"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitCommit } from "lucide-react";
import type { CommitNodeData } from "@/types";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

function CommitNode({ data }: NodeProps) {
    const d = data as unknown as CommitNodeData;

    return (
        <>
            <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-2 !h-2" />
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className="node-glow rounded-full w-8 h-8 flex items-center justify-center cursor-pointer"
                        style={{
                            background: "rgba(15, 23, 42, 0.9)",
                            border: `2px solid ${d.branch ? getBranchColor(d.branch) : "#6366f1"}`,
                        }}
                    >
                        <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px] glass-card border-border">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <code className="text-[10px] text-indigo bg-indigo/10 px-1.5 py-0.5 rounded">
                                {d.sha}
                            </code>
                            <span className="text-[10px] text-muted-foreground">
                                {new Date(d.date).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-xs text-foreground">{d.message}</p>
                        <div className="flex items-center gap-1.5">
                            {d.authorAvatar && (
                                <img
                                    src={d.authorAvatar}
                                    alt={d.authorName}
                                    className="w-4 h-4 rounded-full"
                                />
                            )}
                            <span className="text-[10px] text-muted-foreground">
                                {d.authorName}
                            </span>
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
            <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-2 !h-2" />
        </>
    );
}

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

function getBranchColor(branch: string): string {
    let hash = 0;
    for (let i = 0; i < branch.length; i++) {
        hash = branch.charCodeAt(i) + ((hash << 5) - hash);
    }
    return branchColors[Math.abs(hash) % branchColors.length];
}

export default memo(CommitNode);
