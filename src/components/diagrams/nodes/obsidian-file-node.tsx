"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { SymbolKind } from "@/lib/symbol-parser";

export interface ObsidianNodeData extends Record<string, unknown> {
    label: string;
    displayLabel: string;
    compactLabel: string;
    path: string;
    type: "folder" | "file" | "symbol" | "cluster";
    radius: number;
    color: string;
    extension?: string;
    rawSize?: number;
    childCount?: number;
    symbolKind?: SymbolKind;
    parentPath?: string;
    clusterFileCount?: number;
    clusterFolderPath?: string;
    // Interaction state
    dimmed?: boolean;
    highlighted?: boolean;
    hovered?: boolean;
    hidden?: boolean;
    searchMatch?: boolean;
}

function ObsidianFileNode({ data }: { data: ObsidianNodeData }) {
    if (data.hidden) return null;

    const { radius, color, dimmed, highlighted, hovered, searchMatch, type, clusterFileCount, compactLabel, displayLabel } = data;
    const r = radius;
    const size = r * 2;

    const opacity = dimmed ? 0.08 : 1;
    const scale = hovered ? 1.3 : 1;

    const glowBase = `0 0 ${r * 0.8}px ${color}40`;
    const glowHover = `0 0 ${r * 1.6}px ${color}99`;
    const boxShadow = hovered ? glowHover : glowBase;

    let border = "none";
    if (searchMatch) border = `2px solid #facc15`;
    else if (highlighted) border = `2px solid ${color}`;

    const label = compactLabel || displayLabel || data.label;

    return (
        <div
            style={{
                width: size,
                height: size,
                opacity,
                transform: `scale(${scale})`,
                transition: "opacity 150ms ease-out, transform 150ms ease-out",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {/* Inner circle */}
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: color,
                    boxShadow,
                    border,
                    transition: "box-shadow 150ms ease-out",
                }}
            />

            {/* Cluster badge */}
            {type === "cluster" && clusterFileCount != null && (
                <div
                    style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        background: "#1e293b",
                        border: `1px solid ${color}`,
                        borderRadius: 8,
                        fontSize: 9,
                        color: "#e2e8f0",
                        padding: "1px 4px",
                        lineHeight: 1.4,
                        fontFamily: "monospace",
                        zIndex: 1,
                    }}
                >
                    {clusterFileCount}
                </div>
            )}

            {/* Label */}
            <div
                style={{
                    position: "absolute",
                    top: size + 4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "#e2e8f0",
                    opacity: hovered || highlighted || searchMatch ? 1 : 0,
                    transition: "opacity 150ms ease-out",
                    pointerEvents: "none",
                    textShadow: "0 1px 3px #000",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {label}
            </div>

            {/* Invisible handles */}
            <Handle
                type="target"
                position={Position.Top}
                style={{ width: 0, height: 0, background: "transparent", border: "none", opacity: 0 }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ width: 0, height: 0, background: "transparent", border: "none", opacity: 0 }}
            />
        </div>
    );
}

export default memo(ObsidianFileNode);
