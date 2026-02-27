"use client";

// ============================================================================
// GitViz — Architecture Diagram (Mermaid.js powered)
// ============================================================================
// Replaces React Flow with Mermaid.js for GitDiagram-style interactive diagrams.

import { useMemo } from "react";
import MermaidDiagram from "./mermaid-diagram";
import { generateMermaidDiagram, generateSimpleMermaid } from "@/lib/mermaid-generator";
import type { ArchitectureAnalysis, TreeItem } from "@/types";

interface ArchitectureDiagramProps {
    analysis: ArchitectureAnalysis | null;
    owner: string;
    repo: string;
    tree?: TreeItem[];
}

export default function ArchitectureDiagram({
    analysis,
    owner,
    repo,
    tree,
}: ArchitectureDiagramProps) {
    const mermaidCode = useMemo(() => {
        if (analysis && analysis.modules.length > 0) {
            return generateMermaidDiagram(analysis, owner, repo);
        }

        // Fallback: generate simple diagram from file tree
        if (tree && tree.length > 0) {
            return generateSimpleMermaid(
                tree.map(t => ({ path: t.path, type: t.type })),
                owner,
                repo
            );
        }

        return "";
    }, [analysis, owner, repo, tree]);

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

    return <MermaidDiagram code={mermaidCode} />;
}
