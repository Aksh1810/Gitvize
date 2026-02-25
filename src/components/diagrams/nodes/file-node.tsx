"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from "lucide-react";
import { getFileColor } from "@/lib/file-icons";
import type { FileNodeData } from "@/types";

function FileNode({ data }: NodeProps) {
    const d = data as unknown as FileNodeData;
    const isFolder = d.type === "folder";
    const color = isFolder ? "#6366f1" : getFileColor(d.label);

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-2 !h-2" />
            <div
                className="node-glow rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer min-w-[140px] max-w-[260px]"
                style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: `1px solid ${color}25`,
                    backdropFilter: "blur(8px)",
                }}
            >
                {isFolder && (
                    <span className="text-muted-foreground">
                        {d.isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                        ) : (
                            <ChevronRight className="w-3 h-3" />
                        )}
                    </span>
                )}
                <span style={{ color }}>
                    {isFolder ? (
                        d.isExpanded ? (
                            <FolderOpen className="w-4 h-4" />
                        ) : (
                            <Folder className="w-4 h-4" />
                        )
                    ) : (
                        <File className="w-4 h-4" />
                    )}
                </span>
                <span className="text-xs text-foreground truncate">{d.label}</span>
                {isFolder && d.childCount !== undefined && (
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                        {d.childCount}
                    </span>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-2 !h-2" />
        </>
    );
}

export default memo(FileNode);
