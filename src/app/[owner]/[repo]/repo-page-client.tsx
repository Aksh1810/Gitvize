"use client";

import { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import TabNav from "@/components/dashboard/tab-nav";
import RepoOnboardingGuide from "@/components/dashboard/repo-onboarding-guide";
import AISettingsModal, { loadAISettings } from "@/components/dashboard/ai-settings-modal";
import PipelineStatusDisplay from "@/components/dashboard/pipeline-status";
import ArchitectureDiagram from "@/components/diagrams/architecture-diagram";
import FileTreeGraph from "@/components/diagrams/file-tree-graph";
import ContributorsNetwork from "@/components/diagrams/contributors-network";
import BranchGraph from "@/components/diagrams/branch-graph";
import DependencyGraph from "@/components/diagrams/dependency-graph";
import { parseDependencyFile, type ParsedDependency } from "@/lib/dep-parser";
import { getFileColor } from "@/lib/file-icons";
import { consumeOneTimeGitHubToken } from "@/components/dashboard/github-token-modal";
import CloneProgressScreen, { type CloneStep } from "@/components/dashboard/clone-progress-screen";
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
    const [cachedLoad, setCachedLoad] = useState(false);
    const [cloneStep, setCloneStep] = useState<CloneStep>("checking");
    const [cloneMessage, setCloneMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [repoData, setRepoData] = useState<RepoData | null>(null);
    const [analysis, setAnalysis] = useState<{
        architecture: ArchitectureAnalysis;
        annotations: FileAnnotation[];
        source?: "ai" | "fallback" | "smart";
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
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [sessionToken] = useState<string | null>(() => {
        const token = consumeOneTimeGitHubToken();
        return token || null;
    });
    const [, startTransition] = useTransition();
    const [mountedTabs, setMountedTabs] = useState<DiagramTab[]>(() => [initialTab]);

    // One-time PAT token passed from the landing flow.
    const getToken = useCallback((): string | null => {
        return sessionToken;
    }, [sessionToken]);

    // Fetch all repo data via SSE stream
    const fetchData = useCallback(async () => {
        setLoading(true);
        setCachedLoad(false);
        setCloneStep("checking");
        setCloneMessage("");
        setError(null);

        try {
            const token = getToken();
            const params = new URLSearchParams({ owner, repo });

            const res = await fetch(`/api/github/repo/stream?${params}`, {
                headers: token ? { "x-github-token": token } : undefined,
            });

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response stream");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    if (!part.startsWith("data: ")) continue;
                    let event: Record<string, unknown>;
                    try {
                        event = JSON.parse(part.slice(6));
                    } catch {
                        continue;
                    }

                    const type = event.type as string;

                    if (type === "error") {
                        setError(event.message as string);
                        setLoading(false);
                        return;
                    }

                    if (type === "cached") {
                        setCachedLoad(true);
                    }

                    if (type === "done") {
                        setRepoData(event.payload as RepoData);
                        setLoading(false);
                        // Don't return — keep reading for the enriched event.
                    } else if (type === "enriched") {
                        // GitHub API data is ready — update metadata, mergedPRs, and contributors.
                        const enriched = event.payload as {
                            metadata: RepoData["metadata"];
                            mergedPRs: RepoData["mergedPRs"];
                            contributors?: RepoData["contributors"];
                            commits?: RepoData["commits"];
                        };
                        setRepoData((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      metadata: enriched.metadata,
                                      mergedPRs: enriched.mergedPRs,
                                      ...(enriched.contributors ? { contributors: enriched.contributors } : {}),
                                      ...(enriched.commits ? { commits: enriched.commits } : {}),
                                  }
                                : prev
                        );
                    } else {
                        // Progress events: checking | metadata | cloning | reading
                        setCloneStep(type as CloneStep);
                        setCloneMessage((event.message as string) ?? "");
                    }
                }
            }
        } catch (err) {
            const baseMessage = err instanceof Error ? err.message : "Failed to fetch repository data";
            setError(baseMessage);
            setLoading(false);
        }
    }, [owner, repo, getToken]);

    const runAnalysis = useCallback(async (mode: "smart" | "premium" = "smart") => {
        if (!repoData?.fileTree) return;

        const cached = getCachedDiagram(owner, repo);

        setIsAnalyzing(true);
        let toastId: string | number | undefined;
        if (mode === "premium") {
            toastId = toast.loading("Generating Premium Architecture Diagram...");
        }

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
                    const saved = loadAISettings();
                    if (saved) aiSettings = saved;
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
                                        setAnalysis({
                                            ...event.data,
                                            source: event.data.source ?? "ai"
                                        });
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
                            id: toastId,
                            description: "Generated a fresh diagram for this repository",
                        });
                    } else {
                        if (cached) {
                            setAnalysis({ architecture: cached.architecture, annotations: cached.annotations, source: cached.source });
                            toast.warning("Premium AI unavailable", {
                                id: toastId,
                                description: "Showing cached diagram",
                            });
                        } else {
                            cacheDiagram(owner, repo, { architecture: analysisResult.architecture, annotations: analysisResult.annotations }, "fallback");
                            toast.warning("Premium AI unavailable", {
                                id: toastId,
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
                    source: data.mode === "smart" ? ("smart" as const) : (data.mock ? ("fallback" as const) : ("ai" as const)),
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
                            id: toastId,
                            description: "Generated a fresh diagram for this repository",
                        });
                    } else if (toastId) {
                        toast.dismiss(toastId);
                    }
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setPipelineSteps((prev) =>
                prev.map((s) =>
                    s.status === "running"
                        ? { ...s, status: "error" as const, message: errorMsg }
                        : s
                )
            );
            // If AI failed, try serving from cache
            if (mode === "premium") {
                if (cached) {
                    setAnalysis({ architecture: cached.architecture, annotations: cached.annotations, source: cached.source });
                    toast.error("Analysis Failed", {
                        id: toastId,
                        description: `${errorMsg} — Showing cached diagram instead.`,
                    });
                } else {
                    toast.error("Analysis Failed", {
                        id: toastId,
                        description: errorMsg,
                    });
                }
            }
        } finally {
            setIsAnalyzing(false);
            // If toastId is still visible as loading and wasn't swept by success/error (e.g. edge cases), dismiss it safely.
            // Sonner ignores dismiss() if it's already updated to a strict state like success/error/warning that auto-closes.
            if (toastId) {
                setTimeout(() => toast.dismiss(toastId), 5000); 
            }
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
            startTransition(() => {
                router.replace(`/${owner}/${repo}?${newParams}`, { scroll: false });
            });
        },
        [owner, repo, router, searchParams, startTransition]
    );

    useEffect(() => {
        setMountedTabs((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
    }, [activeTab]);

    // Parse dependencies
    const dependencies: ParsedDependency[] = useMemo(() => {
        if (!repoData?.dependencyFiles) return [];
        return repoData.dependencyFiles.flatMap((df) =>
            parseDependencyFile(df.filename, df.content)
        );
    }, [repoData?.dependencyFiles]);

    const useDotFieldBackground =
        activeTab === "architecture" ||
        activeTab === "contributors" ||
        activeTab === "branches" ||
        activeTab === "dependencies";

    const fileTypeLegend = useMemo(() => {
        const extCounts = new Map<string, number>();
        const items = repoData?.fileTree?.tree ?? [];

        items.forEach((item) => {
            if (item.type !== "blob") return;
            const name = item.path.split("/").pop() || "";
            const ext = (name.split(".").pop() || "other").toLowerCase();
            extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
        });

        return Array.from(extCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([ext, count]) => ({
                ext,
                count,
                color: getFileColor(`file.${ext}`),
            }));
    }, [repoData?.fileTree?.tree]);

    const isTabMounted = useCallback((tab: DiagramTab) => mountedTabs.includes(tab), [mountedTabs]);

    const architectureTabContent = useMemo(() => {
        if (analysis) {
            return (
                <ArchitectureDiagram
                    analysis={analysis.architecture}
                    owner={owner}
                    repo={repo}
                    tree={repoData?.fileTree?.tree}
                    onFallback={() => setAnalysis(null)}
                />
            );
        }

        // Show pipeline status while analyzing OR while waiting for analysis to start.
        // Rendering ArchitectureDiagram(analysis=null) here would start a mermaid.render()
        // that gets cancelled one render cycle later when isAnalyzing becomes true — the
        // dangling internal mermaid render races with the real one and causes an infinite spinner.
        if (isAnalyzing || repoData?.fileTree) {
            return (
                <div className="flex items-center justify-center h-full">
                    <PipelineStatusDisplay steps={pipelineSteps} />
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No data available for this view.
            </div>
        );
    }, [analysis, isAnalyzing, owner, pipelineSteps, repo, repoData?.fileTree]);

    const filesTabContent = useMemo(() => {
        if (repoData?.fileTree) {
            return (
                <FileTreeGraph
                    tree={repoData.fileTree.tree}
                    owner={owner}
                    repo={repo}
                    fileTypeLegend={fileTypeLegend}
                />
            );
        }

        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No data available for this view.
            </div>
        );
    }, [fileTypeLegend, owner, repo, repoData?.fileTree]);

    const contributorsTabContent = useMemo(
        () => <ContributorsNetwork contributors={repoData?.contributors ?? []} />,
        [repoData?.contributors]
    );

    const branchesTabContent = useMemo(() => {
        if (!repoData) {
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No data available for this view.
                </div>
            );
        }

        return (
            <BranchGraph
                branches={repoData.branches}
                commits={repoData.commits}
                defaultBranch={repoData.metadata.defaultBranch}
                owner={owner}
                repo={repo}
            />
        );
    }, [owner, repo, repoData]);

    const dependenciesTabContent = useMemo(
        () => <DependencyGraph dependencies={dependencies} projectName={repo} />,
        [dependencies, repo]
    );

    const openOnboarding = useCallback(() => {
        setShowOnboarding(true);
    }, []);

    const closeOnboarding = useCallback(() => {
        setShowOnboarding(false);
    }, []);

    // Loading state
    if (loading) {
        // Cached repos already have data locally — show a thin progress bar instead
        // of the full clone screen so the user isn't shown clone messaging on refresh.
        if (cachedLoad) {
            return (
                <div className="h-screen w-full bg-[#0a0e1a] flex flex-col">
                    <div className="h-0.5 w-full bg-white/5 overflow-hidden">
                        <div className="h-full bg-indigo-500/70 animate-[loading-bar_1.4s_ease-in-out_infinite]" style={{ width: "100%" }} />
                    </div>
                </div>
            );
        }
        return (
            <CloneProgressScreen
                owner={owner}
                repo={repo}
                currentStep={cloneStep}
                message={cloneMessage}
            />
        );
    }

    // Error state
    if (error) {
        return (
            <CloneProgressScreen
                owner={owner}
                repo={repo}
                currentStep="error"
                message=""
                error={error}
                onRetry={fetchData}
            />
        );
    }

    if (!repoData) return null;

    return (
        <div className="h-screen overflow-hidden pt-14">
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

            <div className="max-w-[1800px] mx-auto h-full flex flex-col ">
                <TabNav
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    rightAction={
                        <button
                            type="button"
                            onClick={openOnboarding}
                            className="inline-flex items-center gap-2 rounded-md border border-border/30 bg-slate-900/55 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70 shrink-0"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                            Show Quick Tips
                        </button>
                    }
                />

                <div className="p-4 flex-1 min-h-0">
                    {/* Main diagram area */}
                    <div className="flex-1 h-full min-h-0">
                        <div className={`relative h-full diagram-shell overscroll-contain surface-neo ${useDotFieldBackground ? "diagram-dot-field" : "diagram-grid"} mesh-grid`}>
                            {isTabMounted("architecture") && (
                                <div
                                    className={`absolute inset-0 ${activeTab === "architecture" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "architecture"}
                                >
                                    {activeTab === "architecture" && !isAnalyzing && (
                                        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                                            {analysis?.source === "ai" && (
                                                <button
                                                    onClick={() => setAnalysis(null)}
                                                    className="ui-micro px-3 py-2 pro-control pro-focus-ring bg-slate-800 text-white border border-slate-700 hover:bg-slate-700 font-medium shadow-sm transition-all"
                                                >
                                                    Show Normal Diagram
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (!hasUserAIKey) {
                                                        setAISettingsOpen(true);
                                                        toast.info("Add your API key for premium diagrams");
                                                        return;
                                                    }
                                                    runAnalysis("premium");
                                                }}
                                                className="ui-micro px-3 py-2 pro-control pro-focus-ring"
                                            >
                                                Generate Premium Diagram
                                            </button>
                                        </div>
                                    )}

                                    {architectureTabContent}
                                </div>
                            )}

                            {isTabMounted("files") && (
                                <div
                                    className={`absolute inset-0 ${activeTab === "files" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "files"}
                                >
                                    {filesTabContent}
                                </div>
                            )}

                            {isTabMounted("contributors") && (
                                <div
                                    className={`absolute inset-0 ${activeTab === "contributors" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "contributors"}
                                >
                                    {contributorsTabContent}
                                </div>
                            )}

                            {isTabMounted("branches") && (
                                <div
                                    className={`absolute inset-0 ${activeTab === "branches" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "branches"}
                                >
                                    {branchesTabContent}
                                </div>
                            )}

                            {isTabMounted("dependencies") && (
                                <div
                                    className={`absolute inset-0 ${activeTab === "dependencies" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "dependencies"}
                                >
                                    {dependenciesTabContent}
                                </div>
                            )}
                        </div>
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

            <RepoOnboardingGuide
                open={showOnboarding}
                activeTab={activeTab}
                onClose={closeOnboarding}
            />
        </div>
    );
}
