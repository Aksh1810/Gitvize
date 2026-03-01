"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getFileColor } from "@/lib/file-icons";
import type { FileNodeData } from "@/types";

function FileNode({ data }: NodeProps) {
    const d = data as unknown as FileNodeData;
    const isFolder = d.type === "folder";
    const color = isFolder ? "#ec4899" : getFileColor(d.label);
    const [isHovered, setIsHovered] = useState(false);

    // Dynamic sizing based on type mirroring GitNexus
    const sizeMap = {
        root: 40,
        folder: 25,
        file: 15,
    };

    // Assign size 
    let size = sizeMap.file;
    if (d.path === "") size = sizeMap.root;
    else if (isFolder) size = sizeMap.folder;

    return (
        <div
            className="group relative flex items-center justify-center cursor-crosshair transition-transform duration-200"
            style={{
                width: size,
                height: size,
                transform: isHovered ? "scale(1.2)" : "scale(1)"
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0 focus:outline-none" />

            {/* Flat Colored Circle matching GitNexus */}
            <div
                className="absolute inset-0 rounded-full transition-all duration-300"
                style={{
                    backgroundColor: color,
                    boxShadow: isHovered ? `0 0 15px ${color}` : "none",
                    border: isHovered ? `2px solid #fff` : `1px solid rgba(0,0,0,0.2)`,
                }}
            />

            {/* Permanent File Label */}
            <div
                className="absolute left-[calc(100%+8px)] whitespace-nowrap text-[11px] font-mono z-50 transition-opacity duration-200 pointer-events-none"
                style={{
                    color: isHovered ? "#fff" : "rgba(255, 255, 255, 0.75)",
                    opacity: 1,
                    textShadow: "0px 1px 3px rgba(0, 0, 0, 0.9)",
                    fontWeight: isHovered ? 600 : 400,
                }}
            >
                {d.label || "root"}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0 focus:outline-none" />
        </div>
    );
}

export default memo(FileNode);
