"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ContributorNodeData } from "@/types";

function ContributorNode({ data }: NodeProps) {
    const d = data as unknown as ContributorNodeData & {
        color: string;
        size: number;
        rank: number;
    };

    const size = d.size ?? 60;
    const avatarSize = Math.max(28, size * 0.55);
    const isTop3 = d.rank <= 3;
    const medals = ["🥇", "🥈", "🥉"];

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
            <a
                href={d.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="relative flex flex-col items-center gap-1.5 cursor-pointer transition-transform hover:scale-110"
                    style={{ width: size + 20 }}
                >
                    {/* Glow ring behind avatar */}
                    <div
                        className="absolute rounded-full blur-md opacity-30"
                        style={{
                            width: avatarSize + 12,
                            height: avatarSize + 12,
                            top: (size - avatarSize) / 2 - 6,
                            left: (size + 20 - avatarSize - 12) / 2,
                            background: d.color,
                        }}
                    />

                    {/* Avatar with ring */}
                    <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
                        <img
                            src={d.avatarUrl}
                            alt={d.login}
                            className="rounded-full object-cover"
                            style={{
                                width: avatarSize,
                                height: avatarSize,
                                border: `2px solid ${d.color}`,
                            }}
                        />

                        {/* Medal for top 3 */}
                        {isTop3 && (
                            <span
                                className="absolute -top-1.5 -right-1.5 text-xs"
                                style={{ fontSize: Math.max(12, size * 0.2) }}
                            >
                                {medals[d.rank - 1]}
                            </span>
                        )}

                        {/* Commit count badge */}
                        <div
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold whitespace-nowrap"
                            style={{
                                background: d.color,
                                color: "#0a0e1a",
                                fontSize: Math.max(8, Math.min(10, size * 0.14)),
                            }}
                        >
                            {d.contributions > 999
                                ? `${(d.contributions / 1000).toFixed(1)}k`
                                : d.contributions}
                        </div>
                    </div>

                    {/* Username */}
                    <span
                        className="text-foreground font-medium truncate text-center w-full group-hover:text-white transition-colors"
                        style={{ fontSize: Math.max(9, Math.min(12, size * 0.16)) }}
                    >
                        {d.login}
                    </span>
                </div>
            </a>
            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
        </>
    );
}

export default memo(ContributorNode);
