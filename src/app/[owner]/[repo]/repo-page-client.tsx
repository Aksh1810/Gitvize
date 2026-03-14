"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/dashboard/navbar";
import TabNav from "@/components/dashboard/tab-nav";
import RepoOverview from "@/components/dashboard/repo-overview";
import AISettingsModal, { loadAISettings } from "@/components/dashboard/ai-settings-modal";
import PipelineStatusDisplay from "@/components/dashboard/pipeline-status";
import ArchitectureDiagram from "@/components/diagrams/architecture-diagram";
import FileTreeGraph from "@/components/diagrams/file-tree-graph";
import ContributorsNetwork from "@/components/diagrams/contributors-network";
import BranchGraph from "@/components/diagrams/branch-graph";
import DependencyGraph from "@/components/diagrams/dependency-graph";
import LanguageDonut from "@/components/charts/language-donut";
import { parseDependencyFile, type ParsedDependency } from "@/lib/dep-parser";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getCachedDiagram, cacheDiagram } from "@/lib/diagram-cache";
import type {
    DiagramTab,
    RepoMetadata,
    FileTreeResponse,
    Contributor,
    Branch,
    Commit,
    MergedPR,
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
    mergedPRs: MergedPR[];
}

export default function RepoPageClient({ owner, repo }: RepoPageClientProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const initialTab = (searchParams.get("tab") as DiagramTab) ?? "files";
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
    const [aiSettingsOpen, setAISettingsOpen] = useState(false);
    const [hasUserAIKey, setHasUserAIKey] = useState(false);

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

    const runAnalysis = useCallback(async (mode: "smart" | "premium" = "smart") => {
        if (!repoData?.fileTree) return;

        const cached = getCachedDiagram(owner, repo);

        setIsAnalyzing(true);
        setPipelineSteps([
            { step: "ingest", status: "running", message: "Fetching file tree..." },
            { step: "understand", status: "pending", message: "Waiting..." },
            { step: "enrich", status: "pending", message: "Waiting..." },
        ]);

        try {
            // Load AI settings from localStorage to send to server
            let aiSettings: { provider: string; apiKey: string; model: string } | undefined;
            if (typeof window !== "undefined") {
                try {
                    const raw = localStorage.getItem("gitviz_ai_settings");
                    if (raw) aiSettings = JSON.parse(raw);
                } catch { /* ignore */ }
            }

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode,
                    owner,
                    repo,
                    tree: repoData.fileTree.tree,
                    readme: repoData.readme,
                    aiSettings,
                }),
            });

            const contentType = res.headers.get("content-type");

            if (contentType?.includes("text/event-stream")) {
                // Handle SSE streaming (premium AI mode)
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                let analysisResult: {
                    architecture: ArchitectureAnalysis;
                    annotations: FileAnnotation[];
                    source?: "ai" | "fallback";
                    fallbackReason?: string;
                    mode?: "smart" | "premium";
                } | null = null;

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
                                        analysisResult = event.data;
                                        setAnalysis(event.data);
                                    }
                                } catch {
                                    // Skip malformed events
                                }
                            }
                        }
                    }
                }

                // Cache result for failure recovery and notify source.
                if (analysisResult) {
                    const source = analysisResult.source ?? "ai";
                    if (source === "ai") {
                        cacheDiagram(owner, repo, { architecture: analysisResult.architecture, annotations: analysisResult.annotations }, "ai");
                        toast.success("Premium AI diagram generated", {
                            description: "Generated a fresh diagram for this repository",
                        });
                    } else {
                        if (cached) {
                            setAnalysis({ architecture: cached.architecture, annotations: cached.annotations });
                            toast.warning("Premium AI unavailable", {
                                description: "Showing cached diagram",
                            });
                        } else {
                            cacheDiagram(owner, repo, { architecture: analysisResult.architecture, annotations: analysisResult.annotations }, "fallback");
                            toast.warning("Premium AI unavailable", {
                                description: analysisResult.fallbackReason
                                    ? analysisResult.fallbackReason.slice(0, 180)
                                    : "Showing smart diagram",
                            });
                        }
                    }
                }
            } else {
                // Handle JSON response (smart mode or premium fallback mode)
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                const result = {
                    architecture: data.architecture,
                    annotations: data.annotations,
                };

                setPipelineSteps([
                    { step: "ingest", status: "complete", message: "Data ingested" },
                    { step: "understand", status: "complete", message: data.mode === "smart" ? "Smart analysis complete" : "Analysis complete" },
                    { step: "enrich", status: "complete", message: data.mode === "smart" ? "Smart diagram ready" : (data.mock ? "Fallback diagram (no AI)" : "Enrichment complete") },
                ]);
                setAnalysis(result);

                if (data.mode === "smart") {
                    // Keep smart-mode generation silent on first load to avoid noisy UI.
                } else {
                    cacheDiagram(owner, repo, result, data.mock ? "fallback" : "ai");
                    if (!data.mock) {
                        toast.success("Premium AI diagram generated", {
                            description: "Generated a fresh diagram for this repository",
                        });
                    }
                }
            }
        } catch (err) {
            setPipelineSteps((prev) =>
                prev.map((s) =>
                    s.status === "running"
                        ? { ...s, status: "error" as const, message: String(err) }
                        : s
                )
            );
            // If AI failed, try serving from cache
            if (mode === "premium" && cached) {
                setAnalysis({ architecture: cached.architecture, annotations: cached.annotations });
                toast.warning("AI analysis failed, showing cached diagram");
            }
        } finally {
            setIsAnalyzing(false);
        }
    }, [repoData, owner, repo]);

    // Load on mount
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-run smart analysis when data loads
    useEffect(() => {
        if (repoData && !analysis && !isAnalyzing) {
            runAnalysis("smart");
        }
    }, [repoData, analysis, isAnalyzing, runAnalysis]);

    useEffect(() => {
        const settings = loadAISettings();
        setHasUserAIKey(Boolean(settings?.apiKey));
    }, [aiSettingsOpen]);

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
                <div className="p-6 space-y-6 max-w-7xl mx-auto">
                    <div className="pro-surface loading-shimmer-soft p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Initializing</p>
                            <h2 className="text-lg font-semibold">Mapping repository signals</h2>
                        </div>
                        <div className="loading-orbit" />
                    </div>
                    <Skeleton className="h-8 w-64" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                onAISettings={() => setAISettingsOpen(true)}
                onExport={() => {
                    const dataStr = JSON.stringify(repoData, null, 2);
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${owner}-${repo}-gitviz.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }}
            />

            <div className="max-w-[1800px] mx-auto">
                <TabNav activeTab={activeTab} onTabChange={handleTabChange} />

                <div className="flex flex-col lg:flex-row gap-4 p-4">
                    {/* Main diagram area */}
                    <div className="flex-1 h-[calc(100vh-140px)]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                                transition={{ duration: 0.35, ease: "easeOut" }}
                                className="h-full diagram-shell diagram-grid overscroll-contain"
                            >
                                {activeTab === "architecture" && analysis ? (
                                    <ArchitectureDiagram
                                        analysis={analysis.architecture}
                                        owner={owner}
                                        repo={repo}
                                        tree={repoData.fileTree?.tree}
                                    />
                                ) : activeTab === "architecture" && isAnalyzing ? (
                                    <div className="flex items-center justify-center h-full">
                                        <PipelineStatusDisplay steps={pipelineSteps} />
                                    </div>
                                ) : activeTab === "architecture" && repoData.fileTree ? (
                                    <ArchitectureDiagram
                                        analysis={null}
                                        owner={owner}
                                        repo={repo}
                                        tree={repoData.fileTree.tree}
                                    />
                                ) : activeTab === "files" && repoData.fileTree ? (
                                    <FileTreeGraph
                                        tree={repoData.fileTree.tree}
                                        owner={owner}
                                        repo={repo}
                                    />
                                ) : activeTab === "contributors" ? (
                                    <ContributorsNetwork
                                        contributors={repoData.contributors}
                                    />
                                ) : activeTab === "branches" ? (
                                    <BranchGraph
                                        branches={repoData.branches}
                                        commits={repoData.commits}
                                        defaultBranch={repoData.metadata.defaultBranch}
                                        owner={owner}
                                        repo={repo}
                                        mergedPRs={repoData.mergedPRs}
                                    />
                                ) : activeTab === "dependencies" ? (
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
                            analysis={analysis?.architecture}
                            repo={repo}
                        />

                        {Object.keys(repoData.languages).length > 0 && (
                            <LanguageDonut languages={repoData.languages} />
                        )}

                        {activeTab === "architecture" && (
                            <div className="pro-surface p-3">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Premium Diagram
                                </div>
                                <button
                                    onClick={() => {
                                        if (!hasUserAIKey) {
                                            setAISettingsOpen(true);
                                            toast.info("Add your API key for premium diagrams");
                                            return;
                                        }
                                        runAnalysis("premium");
                                    }}
                                    className="w-full text-xs px-3 py-2 pro-control pro-focus-ring"
                                >
                                    Generate Premium Diagram
                                </button>
                            </div>
                        )}

                        {/* Pipeline Status (compact) */}
                        {isAnalyzing && (
                            <PipelineStatusDisplay steps={pipelineSteps} />
                        )}
                    </div>
                </div>
            </div>

            <AISettingsModal
                open={aiSettingsOpen}
                onOpenChange={setAISettingsOpen}
                onSave={() => {
                    setHasUserAIKey(true);
                    toast.success("AI key saved", {
                        description: "You can now generate premium architecture diagrams",
                    });
                }}
            />
        </div>
    );
}
