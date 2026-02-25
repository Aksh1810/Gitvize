"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ContributorNodeData } from "@/types";

function ContributorNode({ data }: NodeProps) {
    const d = data as unknown as ContributorNodeData;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-2 !h-2" />
            <a
                href={d.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                <div className="node-glow-cyan rounded-xl p-3 flex flex-col items-center gap-2 cursor-pointer min-w-[100px]"
                    style={{
                        background: "rgba(15, 23, 42, 0.8)",
                        border: "1px solid rgba(34, 211, 238, 0.15)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    {/* Avatar */}
                    <div className="relative">
                        <img
                            src={d.avatarUrl}
                            alt={d.login}
                            className="w-10 h-10 rounded-full ring-2 ring-cyan/20"
                        />
                        {/* Commit count badge */}
                        <div className="absolute -top-1 -right-1 bg-cyan text-background text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {d.contributions > 999
                                ? `${Math.floor(d.contributions / 1000)}k`
                                : d.contributions}
                        </div>
                    </div>
                    <span className="text-xs text-foreground font-medium truncate max-w-[90px]">
                        {d.login}
                    </span>
                </div>
            </a>
            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-2 !h-2" />
        </>
    );
}

export default memo(ContributorNode);
