"use client";

// ============================================================================
// GitViz — Architecture Diagram (GitDiagram-style Mermaid)
// ============================================================================
// Renders architecture as a detailed Mermaid flowchart, matching GitDiagram's
// visual quality: subgraphs, colored classDefs, specific edge labels, click events.

import { useMemo, useState } from "react";
import MermaidDiagram from "./mermaid-diagram";
import { generateArchitectureMermaid, generateArchitectureOverview } from "@/lib/mermaid-generator";
import type { ArchitectureAnalysis, TreeItem } from "@/types";
import { useRouter } from "next/navigation";

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
        <div className="relative h-full w-full">
            <MermaidDiagram code={mermaidCode} onNodeClick={handleNodeClick} onFallback={onFallback} />
            <div className="absolute top-14 left-4 z-20 flex items-center gap-1 rounded-lg border border-white/15 bg-[#111a2b]/95 p-1 text-xs" aria-label="Architecture detail level">
                <button type="button" onClick={() => setView("overview")} aria-pressed={view === "overview"} className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-sky-300 ${view === "overview" ? "bg-sky-300/20 text-sky-100" : "text-slate-300 hover:text-white"}`}>Overview</button>
                <button type="button" onClick={() => setView("files")} aria-pressed={view === "files"} className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-sky-300 ${view === "files" ? "bg-sky-300/20 text-sky-100" : "text-slate-300 hover:text-white"}`}>Key files</button>
            </div>
        </div>
    );
}
