"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Package } from "lucide-react";
import type { DependencyNodeData } from "@/types";

function DependencyNode({ data }: NodeProps) {
    const d = data as unknown as DependencyNodeData;
    const baseSize = 48;
    const size = Math.min(baseSize + d.dependentCount * 4, 120);
    const nodeWidth = Math.max(size + 80, 140);
    const isSelected = Boolean(d.isSelected);
    const isDimmed = Boolean(d.isDimmed);

    return (
        <>
            <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-2 !h-2" />
            <div
                className="node-glow rounded-xl flex flex-col items-center justify-center cursor-pointer p-3"
                style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: isSelected
                        ? "1px solid rgba(250, 204, 21, 0.95)"
                        : `1px solid ${d.isDirect ? "rgba(99, 102, 241, 0.3)" : "rgba(148, 163, 184, 0.15)"}`,
                    backdropFilter: "blur(8px)",
                    width: `${nodeWidth}px`,
                    minHeight: `${size}px`,
                    opacity: isDimmed ? 0.28 : 1,
                    boxShadow: isSelected ? "0 0 0 1px rgba(250,204,21,0.45), 0 0 24px rgba(250,204,21,0.2)" : "none",
                }}
            >
                <Package
                    className="mb-1"
                    style={{
                        width: `${Math.min(16 + d.dependentCount, 24)}px`,
                        height: `${Math.min(16 + d.dependentCount, 24)}px`,
                        color: d.isDirect ? "#6366f1" : "#a855f7",
                    }}
                />
                <span className="text-xs font-medium text-foreground truncate max-w-full" title={d.name}>
                    {d.name}
                </span>
                {d.version && (
                    <span className="text-[9px] text-muted-foreground">{d.version}</span>
                )}
            </div>
            <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-2 !h-2" />
        </>
    );
}

export default memo(DependencyNode);
