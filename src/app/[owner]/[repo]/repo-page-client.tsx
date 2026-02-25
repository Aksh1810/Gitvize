"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/dashboard/navbar";
import TabNav from "@/components/dashboard/tab-nav";
import RepoOverview from "@/components/dashboard/repo-overview";
import PipelineStatusDisplay from "@/components/dashboard/pipeline-status";
import ArchitectureDiagram from "@/components/diagrams/architecture-diagram";
import FileTreeGraph from "@/components/diagrams/file-tree-graph";
import ContributorsNetwork from "@/components/diagrams/contributors-network";
import BranchGraph from "@/components/diagrams/branch-graph";
import DependencyGraph from "@/components/diagrams/dependency-graph";
import CommitHeatmap from "@/components/charts/commit-heatmap";
import LanguageDonut from "@/components/charts/language-donut";
import { parseDependencyFile, type ParsedDependency } from "@/lib/dep-parser";
import { Skeleton } from "@/components/ui/skeleton";
import type {
    DiagramTab,
    RepoMetadata,
    FileTreeResponse,
    Contributor,
    Branch,
    Commit,
    LanguageStats,
    ArchitectureAnalysis,
    FileAnnotation,
    PipelineStep,
    PipelineStatus as PipelineStatusType,
} from "@/types";

interface RepoPageClientProps {
    owner: string;
    repo: string;
}

interface RepoData {
    metadata: RepoMetadata;
    fileTree: FileTreeResponse | null;
    contributors: Contributor[];
    branches: Branch[];
    commits: Commit[];
    readme: string;
    languages: LanguageStats;
    dependencyFiles: Array<{ filename: string; content: string }>;
}

export default function RepoPageClient({ owner, repo }: RepoPageClientProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const initialTab = (searchParams.get("tab") as DiagramTab) ?? "architecture";
    const [activeTab, setActiveTab] = useState<DiagramTab>(initialTab);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [repoData, setRepoData] = useState<RepoData | null>(null);
    const [analysis, setAnalysis] = useState<{
        architecture: ArchitectureAnalysis;
        annotations: FileAnnotation[];
    } | null>(null);
    const [pipelineSteps, setPipelineSteps] = useState<
        Array<{ step: PipelineStep; status: PipelineStatusType; message: string }>
    >([
        { step: "ingest", status: "pending", message: "Waiting..." },
        { step: "understand", status: "pending", message: "Waiting..." },
        { step: "enrich", status: "pending", message: "Waiting..." },
    ]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Get PAT from localStorage
    const getToken = useCallback((): string | null => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("gitviz_github_pat");
        }
        return null;
    }, []);

    // Fetch all repo data
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const token = getToken();
            const params = new URLSearchParams({ owner, repo });
            if (token) params.set("token", token);

            const res = await fetch(`/api/github/repo?${params}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error ?? "Failed to fetch repository data");
            }

            const data: RepoData = await res.json();
            setRepoData(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to fetch repository data"
            );
        } finally {
            setLoading(false);
        }
    }, [owner, repo, getToken]);

    // Run AI analysis
    const runAnalysis = useCallback(async () => {
        if (!repoData?.fileTree) return;

        setIsAnalyzing(true);
        setPipelineSteps([
            { step: "ingest", status: "running", message: "Fetching file tree..." },
            { step: "understand", status: "pending", message: "Waiting..." },
            { step: "enrich", status: "pending", message: "Waiting..." },
        ]);

        try {
            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    owner,
                    repo,
                    tree: repoData.fileTree.tree,
                    readme: repoData.readme,
                }),
            });

            const contentType = res.headers.get("content-type");

            if (contentType?.includes("text/event-stream")) {
                // Handle SSE streaming
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();

                if (reader) {
                    let buffer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n\n");
                        buffer = lines.pop() ?? "";

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                try {
                                    const event = JSON.parse(line.substring(6));
                                    setPipelineSteps((prev) =>
                                        prev.map((s) =>
                                            s.step === event.step ? { ...s, ...event } : s
                                        )
                                    );

                                    if (event.data) {
                                        setAnalysis(event.data);
                                    }
                                } catch {
                                    // Skip malformed events
                                }
                            }
                        }
                    }
                }
            } else {
                // Handle JSON response (mock mode)
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                setPipelineSteps([
                    { step: "ingest", status: "complete", message: "Data ingested" },
                    { step: "understand", status: "complete", message: "Analysis complete" },
                    { step: "enrich", status: "complete", message: data.mock ? "Mock analysis (no AI key)" : "Enrichment complete" },
                ]);
                setAnalysis({
                    architecture: data.architecture,
                    annotations: data.annotations,
                });
            }
        } catch (err) {
            setPipelineSteps((prev) =>
                prev.map((s) =>
                    s.status === "running"
                        ? { ...s, status: "error" as const, message: String(err) }
                        : s
                )
            );
        } finally {
            setIsAnalyzing(false);
        }
    }, [repoData, owner, repo]);

    // Load on mount
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-run analysis when data loads
    useEffect(() => {
        if (repoData && !analysis && !isAnalyzing) {
            runAnalysis();
        }
    }, [repoData, analysis, isAnalyzing, runAnalysis]);

    // Tab change updates URL
    const handleTabChange = useCallback(
        (tab: DiagramTab) => {
            setActiveTab(tab);
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.set("tab", tab);
            router.replace(`/${owner}/${repo}?${newParams}`, { scroll: false });
        },
        [owner, repo, router, searchParams]
    );

    // Parse dependencies
    const dependencies: ParsedDependency[] = useMemo(() => {
        if (!repoData?.dependencyFiles) return [];
        return repoData.dependencyFiles.flatMap((df) =>
            parseDependencyFile(df.filename, df.content)
        );
    }, [repoData?.dependencyFiles]);

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen pt-14">
                <Navbar owner={owner} repo={repo} />
                <div className="p-6 space-y-4 max-w-7xl mx-auto">
                    <Skeleton className="h-8 w-64" />
                    <div className="grid grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-20" />
                        ))}
                    </div>
                    <Skeleton className="h-[500px]" />
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="min-h-screen pt-14">
                <Navbar owner={owner} repo={repo} />
                <div className="flex items-center justify-center h-[70vh]">
                    <div className="glass-card p-8 text-center max-w-md">
                        <div className="text-4xl mb-4">⚠️</div>
                        <h2 className="text-xl font-bold mb-2">Oops!</h2>
                        <p className="text-sm text-muted-foreground mb-4">{error}</p>
                        <button
                            onClick={fetchData}
                            className="text-sm text-indigo hover:underline"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!repoData) return null;

    return (
        <div className="min-h-screen pt-14">
            <Navbar
                owner={owner}
                repo={repo}
                onRegenerate={() => {
                    setAnalysis(null);
                    runAnalysis();
                }}
                isRegenerating={isAnalyzing}
            />

            <div className="max-w-[1800px] mx-auto">
                <TabNav activeTab={activeTab} onTabChange={handleTabChange} />

                <div className="flex flex-col lg:flex-row gap-4 p-4">
                    {/* Main diagram area */}
                    <div className="flex-1 min-h-[600px]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-[600px] glass-card overflow-hidden rounded-xl"
                            >
                                {activeTab === "architecture" && analysis ? (
                                    <ArchitectureDiagram
                                        analysis={analysis.architecture}
                                        owner={owner}
                                        repo={repo}
                                    />
                                ) : activeTab === "architecture" && isAnalyzing ? (
                                    <div className="flex items-center justify-center h-full">
                                        <PipelineStatusDisplay steps={pipelineSteps} />
                                    </div>
                                ) : activeTab === "architecture" ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                        No analysis available. Click Regenerate.
                                    </div>
                                ) : activeTab === "files" && repoData.fileTree ? (
                                    <FileTreeGraph
                                        tree={repoData.fileTree.tree}
                                        owner={owner}
                                        repo={repo}
                                    />
                                ) : activeTab === "contributors" &&
                                    repoData.contributors.length > 0 ? (
                                    <ContributorsNetwork
                                        contributors={repoData.contributors}
                                    />
                                ) : activeTab === "branches" ? (
                                    <BranchGraph
                                        branches={repoData.branches}
                                        commits={repoData.commits}
                                        defaultBranch={repoData.metadata.defaultBranch}
                                    />
                                ) : activeTab === "dependencies" &&
                                    dependencies.length > 0 ? (
                                    <DependencyGraph
                                        dependencies={dependencies}
                                        projectName={repo}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                        No data available for this view.
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Sidebar */}
                    <div className="w-full lg:w-[340px] space-y-4">
                        <RepoOverview
                            metadata={repoData.metadata}
                            readme={repoData.readme}
                            analysis={analysis?.architecture}
                        />

                        {repoData.commits.length > 0 && (
                            <CommitHeatmap commits={repoData.commits} />
                        )}

                        {Object.keys(repoData.languages).length > 0 && (
                            <LanguageDonut languages={repoData.languages} />
                        )}

                        {/* Pipeline Status (compact) */}
                        {isAnalyzing && (
                            <PipelineStatusDisplay steps={pipelineSteps} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
