"use client";

import { useMemo, useState } from "react";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import FlowWrapper from "./flow-wrapper";
import ModuleNode from "./nodes/module-node";
import { getLayoutedElements } from "@/lib/dagre-layout";
import { MODULE_TYPE_COLORS } from "@/lib/constants";
import type { ArchitectureAnalysis, ModuleNodeData } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink } from "lucide-react";

const nodeTypes = { module: ModuleNode };

interface ArchitectureDiagramProps {
    analysis: ArchitectureAnalysis;
    owner: string;
    repo: string;
}

export default function ArchitectureDiagram({
    analysis,
    owner,
    repo,
}: ArchitectureDiagramProps) {
    const [selectedModule, setSelectedModule] = useState<ModuleNodeData | null>(null);

    const { nodes, edges } = useMemo(() => {
        const rawNodes: Node[] = analysis.modules.map((mod, i) => ({
            id: mod.name,
            type: "module",
            position: { x: 0, y: 0 },
            data: {
                label: mod.name,
                type: mod.type,
                description: mod.description,
                fileCount: mod.files.length,
                files: mod.files,
                entryPoint: mod.entryPoint,
                color: MODULE_TYPE_COLORS[mod.type] ?? "#6b7280",
            } satisfies ModuleNodeData & { color: string },
        }));

        const rawEdges: Edge[] = [];

        // Edges from module dependencies
        analysis.modules.forEach((mod) => {
            mod.dependencies.forEach((dep) => {
                if (analysis.modules.find((m) => m.name === dep)) {
                    rawEdges.push({
                        id: `${mod.name}-${dep}`,
                        source: dep,
                        target: mod.name,
                        animated: true,
                        style: { stroke: "rgba(99, 102, 241, 0.4)", strokeWidth: 2 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(99, 102, 241, 0.6)" },
                    });
                }
            });
        });

        // Edges from dataFlow
        analysis.dataFlow.forEach((flow, i) => {
            const edgeId = `flow-${flow.from}-${flow.to}-${i}`;
            if (!rawEdges.find((e) => e.id === edgeId)) {
                rawEdges.push({
                    id: edgeId,
                    source: flow.from,
                    target: flow.to,
                    label: flow.description,
                    animated: true,
                    style: { stroke: "rgba(34, 211, 238, 0.4)", strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(34, 211, 238, 0.6)" },
                });
            }
        });

        return getLayoutedElements(rawNodes, rawEdges, {
            direction: "TB",
            nodeWidth: 250,
            nodeHeight: 100,
            rankSep: 100,
            nodeSep: 60,
        });
    }, [analysis]);

    return (
        <>
            <FlowWrapper
                initialNodes={nodes}
                initialEdges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => {
                    setSelectedModule(node.data as unknown as ModuleNodeData);
                }}
            />

            {/* Side Panel */}
            <Sheet open={!!selectedModule} onOpenChange={() => setSelectedModule(null)}>
                <SheetContent className="glass-card border-l border-border/30 w-[400px] sm:w-[540px]">
                    {selectedModule && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ background: MODULE_TYPE_COLORS[selectedModule.type] }}
                                    />
                                    {selectedModule.label}
                                </SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-4">
                                <Badge variant="outline" className="text-xs">
                                    {selectedModule.type}
                                </Badge>
                                <p className="text-sm text-muted-foreground">
                                    {selectedModule.description}
                                </p>
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                        Files ({selectedModule.files.length})
                                    </h4>
                                    <ScrollArea className="h-[300px]">
                                        <div className="space-y-1">
                                            {selectedModule.files.map((file) => (
                                                <a
                                                    key={file}
                                                    href={`https://github.com/${owner}/${repo}/blob/HEAD/${file}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                                                >
                                                    <span className="truncate flex-1">{file}</span>
                                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </a>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}
