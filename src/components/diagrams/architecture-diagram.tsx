"use client";

// ============================================================================
// GitViz — Architecture Diagram (GitDiagram-style Mermaid)
// ============================================================================
// Renders architecture as a detailed Mermaid flowchart, matching GitDiagram's
// visual quality: subgraphs, colored classDefs, specific edge labels, click events.

import { useMemo } from "react";
import MermaidDiagram from "./mermaid-diagram";
import { generateArchitectureMermaid } from "@/lib/mermaid-generator";
import type { ArchitectureAnalysis, TreeItem } from "@/types";
import { useRouter } from "next/navigation";

interface ArchitectureDiagramProps {
    analysis: ArchitectureAnalysis | null;
    owner: string;
    repo: string;
    tree?: TreeItem[];
    onFallback?: () => void;
}

export default function ArchitectureDiagram({
    analysis,
    owner,
    repo,
    tree,
    onFallback,
}: ArchitectureDiagramProps) {
    const router = useRouter();

    const mermaidCode = useMemo(() => {
        if (!tree || tree.length === 0) return "";
        return generateArchitectureMermaid(analysis, tree, owner, repo);
    }, [analysis, tree, owner, repo]);

    const handleNodeClick = (path: string) => {
        // If it's a GitHub URL, open in new tab
        if (path.startsWith("http")) {
            window.open(path, "_blank");
            return;
        }
        // Otherwise navigate to file
        router.push(`/${owner}/${repo}?file=${path}`);
    };

    if (!mermaidCode) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">📊</div>
                    <p className="text-sm text-gray-400">
                        No architecture data available
                    </p>
                </div>
            </div>
        );
    }

    return (
        <MermaidDiagram code={mermaidCode} onNodeClick={handleNodeClick} onFallback={onFallback} />
    );
}
