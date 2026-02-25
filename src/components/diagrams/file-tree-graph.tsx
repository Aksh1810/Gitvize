"use client";

import { useMemo, useState, useCallback } from "react";
import { type Node, type Edge } from "@xyflow/react";
import FlowWrapper from "./flow-wrapper";
import FileNode from "./nodes/file-node";
import { getLayoutedElements, type LayoutDirection } from "@/lib/dagre-layout";
import { getFileColor } from "@/lib/file-icons";
import type { TreeItem, FileNodeData } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, ExternalLink } from "lucide-react";

const nodeTypes = { file: FileNode };

interface FileTreeGraphProps {
    tree: TreeItem[];
    owner: string;
    repo: string;
}

export default function FileTreeGraph({ tree, owner, repo }: FileTreeGraphProps) {
    const [direction, setDirection] = useState<LayoutDirection>("TB");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
        new Set([""])
    );
    const [selectedFile, setSelectedFile] = useState<FileNodeData | null>(null);

    const toggleFolder = useCallback((path: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const { nodes, edges } = useMemo(() => {
        const rawNodes: Node[] = [];
        const rawEdges: Edge[] = [];
        const addedFolders = new Set<string>();

        // Root node
        rawNodes.push({
            id: "root",
            type: "file",
            position: { x: 0, y: 0 },
            data: {
                label: repo,
                path: "",
                type: "folder",
                isExpanded: expandedFolders.has(""),
                childCount: tree.length,
                color: "#6366f1",
            } satisfies FileNodeData & { color: string },
        });

        // Only show items in expanded folders (lazy expand)
        const visibleItems = tree.filter((item) => {
            const parentPath = item.path.substring(0, item.path.lastIndexOf("/"));
            return parentPath === "" || expandedFolders.has(parentPath);
        });

        // Limit visible items for performance
        const limitedItems = visibleItems.slice(0, 300);

        limitedItems.forEach((item) => {
            const isFolder = item.type === "tree";
            const parts = item.path.split("/");
            const label = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join("/");
            const parentId = parentPath === "" ? "root" : `folder:${parentPath}`;

            if (isFolder) {
                const childCount = tree.filter(
                    (t) =>
                        t.path.startsWith(item.path + "/") &&
                        t.path.split("/").length === parts.length + 1
                ).length;

                if (!addedFolders.has(item.path)) {
                    addedFolders.add(item.path);
                    rawNodes.push({
                        id: `folder:${item.path}`,
                        type: "file",
                        position: { x: 0, y: 0 },
                        data: {
                            label,
                            path: item.path,
                            type: "folder",
                            isExpanded: expandedFolders.has(item.path),
                            childCount,
                            color: "#6366f1",
                        } satisfies FileNodeData & { color: string },
                    });

                    rawEdges.push({
                        id: `edge:${parentId}-folder:${item.path}`,
                        source: parentId,
                        target: `folder:${item.path}`,
                        style: { stroke: "rgba(99, 102, 241, 0.2)", strokeWidth: 1 },
                    });
                }
            } else {
                rawNodes.push({
                    id: `file:${item.path}`,
                    type: "file",
                    position: { x: 0, y: 0 },
                    data: {
                        label,
                        path: item.path,
                        type: "file",
                        extension: label.split(".").pop(),
                        size: item.size,
                        color: getFileColor(label),
                    } satisfies FileNodeData & { color: string },
                });

                rawEdges.push({
                    id: `edge:${parentId}-file:${item.path}`,
                    source: parentId,
                    target: `file:${item.path}`,
                    style: { stroke: "rgba(99, 102, 241, 0.15)", strokeWidth: 1 },
                });
            }
        });

        return getLayoutedElements(rawNodes, rawEdges, {
            direction,
            nodeWidth: 180,
            nodeHeight: 40,
            rankSep: 50,
            nodeSep: 20,
        });
    }, [tree, repo, expandedFolders, direction]);

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            const d = node.data as unknown as FileNodeData;
            if (d.type === "folder") {
                toggleFolder(d.path);
            } else {
                setSelectedFile(d);
            }
        },
        [toggleFolder]
    );

    return (
        <div className="relative w-full h-full">
            {/* Layout toggle */}
            <div className="absolute top-4 left-4 z-10">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDirection((d) => (d === "TB" ? "LR" : "TB"))}
                    className="glass-card border-border/30 text-xs"
                >
                    <ArrowDownUp className="w-3 h-3 mr-1.5" />
                    {direction === "TB" ? "Top-Down" : "Left-Right"}
                </Button>
            </div>

            <FlowWrapper
                initialNodes={nodes}
                initialEdges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
            />

            {/* File Drawer */}
            <Sheet open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
                <SheetContent className="glass-card border-l border-border/30">
                    {selectedFile && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="text-sm">{selectedFile.label}</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-3">
                                <div className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Path:</span>{" "}
                                    {selectedFile.path}
                                </div>
                                {selectedFile.extension && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Type:</span>
                                        <Badge
                                            variant="outline"
                                            className="text-[10px]"
                                            style={{ borderColor: getFileColor(selectedFile.label) + "40", color: getFileColor(selectedFile.label) }}
                                        >
                                            .{selectedFile.extension}
                                        </Badge>
                                    </div>
                                )}
                                {selectedFile.size !== undefined && (
                                    <div className="text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">Size:</span>{" "}
                                        {formatBytes(selectedFile.size)}
                                    </div>
                                )}
                                <a
                                    href={`https://github.com/${owner}/${repo}/blob/HEAD/${selectedFile.path}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Button variant="outline" size="sm" className="mt-4 text-xs">
                                        <ExternalLink className="w-3 h-3 mr-1.5" />
                                        View on GitHub
                                    </Button>
                                </a>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}
