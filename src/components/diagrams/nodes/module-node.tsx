"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, Globe, Database, Settings, Wrench, TestTube, Hammer, BookOpen, Cpu, Shield, Server, Layout, Eye, Package } from "lucide-react";
import { MODULE_TYPE_COLORS } from "@/lib/constants";
import type { ModuleNodeData } from "@/types";

const iconMap: Record<string, React.ReactNode> = {
    api: <Globe className="w-4 h-4" />,
    ui: <Layout className="w-4 h-4" />,
    database: <Database className="w-4 h-4" />,
    config: <Settings className="w-4 h-4" />,
    utility: <Wrench className="w-4 h-4" />,
    test: <TestTube className="w-4 h-4" />,
    build: <Hammer className="w-4 h-4" />,
    docs: <BookOpen className="w-4 h-4" />,
    core: <Cpu className="w-4 h-4" />,
    middleware: <Shield className="w-4 h-4" />,
    service: <Server className="w-4 h-4" />,
    model: <Database className="w-4 h-4" />,
    controller: <Boxes className="w-4 h-4" />,
    view: <Eye className="w-4 h-4" />,
    other: <Package className="w-4 h-4" />,
};

function ModuleNode({ data }: NodeProps) {
    const d = data as unknown as ModuleNodeData;
    const color = MODULE_TYPE_COLORS[d.type] ?? "#6b7280";

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-3 !h-3" />
            <div
                className="node-glow rounded-xl p-4 min-w-[200px] max-w-[280px] cursor-pointer"
                style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: `1px solid ${color}30`,
                    backdropFilter: "blur(12px)",
                }}
            >
                <div className="flex items-center gap-2 mb-2">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${color}15`, color }}
                    >
                        {iconMap[d.type] ?? <Package className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                            {d.label}
                        </div>
                        <div
                            className="text-[10px] uppercase font-medium"
                            style={{ color }}
                        >
                            {d.type}
                        </div>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {d.description}
                </p>
                <div className="text-[10px] text-muted-foreground/60">
                    {d.fileCount} file{d.fileCount !== 1 ? "s" : ""}
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
        </>
    );
}

export default memo(ModuleNode);
