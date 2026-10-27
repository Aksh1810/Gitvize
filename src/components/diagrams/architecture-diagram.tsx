"use client";

// ============================================================================
// Gitvize — Architecture Diagram (GitDiagram-style Mermaid)
// ============================================================================
// Renders architecture as a detailed Mermaid flowchart, matching GitDiagram's
// visual quality: subgraphs, colored classDefs, specific edge labels, click events.

import { useMemo, useState } from "react";
import MermaidDiagram from "./mermaid-diagram";
import { generateArchitectureMermaid, generateArchitectureOverview } from "@/lib/mermaid-generator";
import type { ArchitectureAnalysis, TreeItem } from "@/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ArchitectureDiagramProps {
    analysis: ArchitectureAnalysis | null;
    owner: string;
    repo: string;
    defaultBranch: string;
    tree?: TreeItem[];
    onFallback?: () => void;
    source?: "ai" | "fallback" | "smart";
}

export default function ArchitectureDiagram({
    analysis,
    owner,
    repo,
    defaultBranch,
    tree,
    onFallback,
    source,
}: ArchitectureDiagramProps) {
    const router = useRouter();
    const [view, setView] = useState<"overview" | "files">(source === "ai" ? "files" : "overview");

    const mermaidCode = useMemo(() => {
        if (!tree || tree.length === 0) return "";
        return view === "overview" ? generateArchitectureOverview(tree) : generateArchitectureMermaid(analysis, tree, owner, repo, defaultBranch);
    }, [analysis, tree, owner, repo, defaultBranch, view]);

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
            <div className="architecture-state">
                <div className="text-center">
                    <div className="text-4xl mb-4">📊</div>
                    <p className="text-sm text-muted-foreground">
                        No architecture data available
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="architecture-frame h-full min-h-0 min-w-0">
            <MermaidDiagram code={mermaidCode} onNodeClick={handleNodeClick} onFallback={onFallback} viewControls={
                <div className="architecture-control-group" role="group" aria-label="Architecture detail level">
                    <Button variant="outline" onClick={() => setView("overview")} aria-pressed={view === "overview"}>Overview</Button>
                    <Button variant="outline" onClick={() => setView("files")} aria-pressed={view === "files"}>Key files</Button>
                </div>
            } />
        </div>
    );
}
