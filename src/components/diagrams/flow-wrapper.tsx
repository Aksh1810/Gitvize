"use client";

import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type NodeTypes,
    BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect } from "react";

interface FlowWrapperProps {
    initialNodes: Node[];
    initialEdges: Edge[];
    nodeTypes?: NodeTypes;
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    className?: string;
    fitViewOptions?: { padding?: number; maxZoom?: number };
}

export default function FlowWrapper({
    initialNodes,
    initialEdges,
    nodeTypes,
    onNodeClick,
    className = "",
    fitViewOptions = { padding: 0.2, maxZoom: 1.5 },
}: FlowWrapperProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Sync state when props change (e.g., layout direction toggle or data refresh)
    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const handleNodeClick = useCallback(
        (event: React.MouseEvent, node: Node) => {
            onNodeClick?.(event, node);
        },
        [onNodeClick]
    );

    return (
        <div className={`w-full h-[800px] ${className}`}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={fitViewOptions}
                minZoom={0.1}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(99, 102, 241, 0.08)" />
                <Controls className="!bg-transparent" />
                <MiniMap
                    nodeColor={(node) => {
                        if (node.data?.color) return node.data.color as string;
                        return "rgba(99, 102, 241, 0.5)";
                    }}
                    maskColor="rgba(2, 8, 23, 0.7)"
                />
            </ReactFlow>
        </div>
    );
}
