"use client";

import { useState, useEffect, useCallback, useMemo, useTransition, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { DIAGRAM_TABS } from "@/lib/constants";
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
import GitHubTokenModal, { consumeOneTimeGitHubToken, setOneTimeGitHubToken } from "@/components/dashboard/github-token-modal";
import CloneProgressScreen, { type CloneStep } from "@/components/dashboard/clone-progress-screen";
import BrandLogo from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCachedDiagram, cacheDiagram } from "@/lib/diagram-cache";
import { parseRepositorySnapshot, repositorySnapshotKey, RepositorySnapshotError } from "@/lib/repository-snapshot";
import { buildAnalysisRequest, resolveAnalysisResponse } from "@/lib/analysis-client";
import type {
    DiagramTab,
    RepoMetadata,
    RepositorySnapshot,
    RepositoryObservations,
    FileTreeResponse,
    Contributor,
    Branch,
    Commit,
    MergedPR,
    LanguageStats,
    PipelineStep,
    PipelineStatus as PipelineStatusType,
    RepositoryAnalysisResult,
} from "@/types";

interface RepoPageClientProps {
    owner: string;
    repo: string;
}

interface RepoData {
    snapshot?: RepositorySnapshot;
    observations?: RepositoryObservations;
    metadata: RepoMetadata;
    fileTree: FileTreeResponse | null;
    contributors: Contributor[];
    contributorsTruncated?: boolean;
    contributorsFetchError?: string | null;
    branches: Branch[];
    commits: Commit[];
    commitsFetchError?: boolean;
    readme: string;
    languages: LanguageStats;
    dependencyFiles: Array<{ filename: string; content: string }>;
    mergedPRs: MergedPR[];
}


type AnalysisMode = "smart" | "premium";
type AnalysisSteps = Array<{ step: PipelineStep; status: PipelineStatusType; message: string }>;
type DisplayAnalysis = Pick<RepositoryAnalysisResult, "architecture" | "annotations" | "source">;
interface AnalysisSession {
    identity: readonly unknown[];
    active: boolean;
    generation: number;
    attempted: boolean;
    pendingMode: AnalysisMode | null;
    toastId?: string | number;
}
interface AnalysisView {
    session: AnalysisSession;
    selectedMode: AnalysisMode;
    generation: number;
    results: Partial<Record<AnalysisMode, { result: DisplayAnalysis; generation: number }>>;
    requestMode: AnalysisMode | null;
    error: string | null;
    steps: AnalysisSteps;
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
    const [aiSettingsOpen, setAISettingsOpen] = useState(false);
    const [aiSettings, setAISettings] = useState(() => loadAISettings());
    const hasUserAIKey = Boolean(aiSettings?.apiKey);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [tokenModalOpen, setTokenModalOpen] = useState(false);
    const [dashboardToken, setDashboardToken] = useState<string | null>(null);
    const [sessionToken] = useState<string | null>(() => {
        const token = consumeOneTimeGitHubToken();
        return token || null;
    });
    const [, startTransition] = useTransition();
    const [mountedTabs, setMountedTabs] = useState<DiagramTab[]>(() => [initialTab]);
    // Tracks the active stream request so cleanup can abort it (prevents duplicate
    // connections in React StrictMode where effects run mount→unmount→mount).
    const abortRef = useRef<AbortController | null>(null);
    // One-time PAT token passed from the landing flow, or a token added via the dashboard Token button.
    const getToken = useCallback((): string | null => {
        return dashboardToken ?? sessionToken;
    }, [dashboardToken, sessionToken]);

    const githubToken = dashboardToken ?? sessionToken;
    const repositoryContext = useMemo(() => ({ owner, repo, githubToken }), [owner, repo, githubToken]);
    const [loadedContext, setLoadedContext] = useState<typeof repositoryContext | null>(null);
    const loadedTree = loadedContext === repositoryContext ? repoData?.fileTree : null;
    const emptyTree = repoData?.snapshot?.status === "ready" && loadedTree?.tree.length === 0;
    const analysisTree = emptyTree ? null : loadedTree;
    const analysisSnapshotIdentity = loadedContext === repositoryContext ? repositorySnapshotKey(repoData?.snapshot) : undefined;
    // Credentials stay in memory; neither they nor this identity enter persisted cache keys.
    // Commit identity invalidates analysis even when the tree contents are unchanged.
    const analysisSession = useMemo<AnalysisSession>(() => ({ identity: [repositoryContext, analysisTree, analysisSnapshotIdentity, aiSettings?.provider, aiSettings?.model, aiSettings?.apiKey], active: false, generation: 0, attempted: false, pendingMode: null }),
        [repositoryContext, analysisTree, analysisSnapshotIdentity, aiSettings?.provider, aiSettings?.model, aiSettings?.apiKey]);
    const [analysisView, setAnalysisView] = useState<AnalysisView | null>(null);
    const currentView = analysisView?.session === analysisSession ? analysisView : null;
    const selectedMode = currentView?.selectedMode ?? "smart";
    const selectedResult = currentView?.results[selectedMode];
    const displayedResult = selectedResult ?? currentView?.results[selectedMode === "smart" ? "premium" : "smart"];
    const analysis = displayedResult?.result;
    const isAnalyzing = Boolean(currentView?.requestMode);

    useEffect(() => {
        analysisSession.active = true;
        return () => {
            analysisSession.active = false;
            analysisSession.generation++;
            analysisSession.pendingMode = null;
            if (analysisSession.toastId !== undefined) toast.dismiss(analysisSession.toastId);
        };
    }, [analysisSession, analysisTree]);


    // Fetch all repo data via SSE stream
    const fetchData = useCallback(async () => {
        // Abort any in-flight stream before opening a new one. This prevents
        // React StrictMode's double-invoke from leaving two readers open simultaneously.
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;
        const { signal } = controller;

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
                signal,
            });

            if (signal.aborted) return;
            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response stream");

            const decoder = new TextDecoder();
            let buffer = "";
            let receivedDone = false;

            while (true) {
                if (signal.aborted) break;
                const { done, value } = await reader.read();
                if (signal.aborted) return;
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
                        receivedDone = true;
                        const payload = event.payload as RepoData;
                        if (payload.snapshot) {
                            payload.snapshot = parseRepositorySnapshot(payload.snapshot, owner, repo);
                            if ((payload.snapshot.status === "ready" && payload.fileTree?.sha !== payload.snapshot.treeSha) || (payload.snapshot.status === "empty" && payload.fileTree !== null)) throw new RepositorySnapshotError();
                        }
                        setRepoData(payload);
                        setLoadedContext(repositoryContext);
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
            // Stream closed without a "done" event (e.g. Vercel timeout, network drop).
            // Prevent the loading spinner from hanging indefinitely.
            if (!receivedDone && !signal.aborted) {
                setError("Repository data could not be loaded. The repo may be too large or the request timed out.");
                setLoading(false);
            }
        } catch (err) {
            // AbortError means this request was intentionally cancelled by cleanup —
            // do not surface it as an error or update any state.
            if (signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
            const baseMessage = err instanceof Error ? err.message : "Failed to fetch repository data";
            setError(baseMessage);
            setLoading(false);
        }
    }, [owner, repo, getToken, repositoryContext]);

    const runAnalysis = useCallback(async (mode: AnalysisMode = "smart") => {
        if (!analysisTree || !analysisSession.active || analysisSession.pendingMode === mode) return;
        if (analysisSession.toastId !== undefined) toast.dismiss(analysisSession.toastId);
        const generation = ++analysisSession.generation;
        analysisSession.attempted = true;
        analysisSession.pendingMode = mode;
        const ownsRequest = () => analysisSession.active && analysisSession.generation === generation;
        const updateView = (update: (previous: AnalysisView) => AnalysisView) => {
            if (!ownsRequest()) return;
            setAnalysisView(previous => previous?.session === analysisSession && ownsRequest() ? update(previous) : previous);
        };
        setAnalysisView(previous => ({
            session: analysisSession, selectedMode: mode, generation,
            results: previous?.session === analysisSession ? previous.results : {},
            requestMode: mode, error: null, steps: [],
        }));
        const setPipelineSteps = (update: AnalysisSteps | ((previous: AnalysisSteps) => AnalysisSteps)) =>
            updateView(previous => ({ ...previous, steps: typeof update === "function" ? update(previous.steps) : update }));
        const storeResult = (result: DisplayAnalysis, cached = false) => updateView(previous => ({ ...previous, results: { ...previous.results, [mode]: { result, generation: cached ? -1 : generation } } }));
        const cacheOpts = { snapshot: repoData?.snapshot, mode, provider: aiSettings?.provider, model: aiSettings?.model };
        const stored = getCachedDiagram(owner, repo, cacheOpts);
        let cached: DisplayAnalysis | null = null;
        if (stored) {
            try {
                const validated = await resolveAnalysisResponse({ ...stored, source: stored.source === "ai" ? "pending" : "fallback", metadataSource: stored.metadataSource ?? "deterministic" });
                if (stored.source !== "ai" || validated.source === "ai") cached = validated;
            } catch { /* Invalid cached data cannot replace the current view. */ }
            if (!ownsRequest()) return;
        }

        let toastId: string | number | undefined;
        if (mode === "premium") {
            toastId = toast.loading("Generating Premium Architecture Diagram...");
            analysisSession.toastId = toastId;
        }

        // Compute trimmed tree before setting pipeline steps so the ingest
        // message can include the sampling count.
        const rawTree = analysisTree.tree;
        const totalFileCount = rawTree.filter(i => i.type === "blob").length;
        const MAX_ANALYZE_FILES = 500;
        const priorityDirs = new Set(["src", "lib", "kernel", "drivers", "include", "app", "core", "api", "pkg"]);
        const codeExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "h", "cpp", "rb", "vue", "swift", "kt"]);
        let treeToSend: typeof rawTree = rawTree;
        let ingestMsg = "Analyzing repository data...";
        if (rawTree.length > MAX_ANALYZE_FILES) {
            treeToSend = rawTree
                .filter(i => i.type === "blob")
                .map(item => {
                    const parts = item.path.split("/");
                    const depth = parts.length - 1;
                    let score = Math.max(0, 6 - depth) * 10;
                    if (priorityDirs.has((parts[0] ?? "").toLowerCase())) score += 20;
                    const ext = (parts[parts.length - 1].split(".").pop() ?? "").toLowerCase();
                    if (codeExts.has(ext)) score += 10;
                    return { item, score };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, MAX_ANALYZE_FILES)
                .map(s => s.item);
            ingestMsg = `Analyzing top ${MAX_ANALYZE_FILES} most relevant files out of ${totalFileCount} total`;
        }

        setPipelineSteps([
            { step: "ingest", status: "running", message: ingestMsg },
            { step: "understand", status: "pending", message: "Waiting..." },
            { step: "enrich", status: "pending", message: "Waiting..." },
        ]);

        let analyzeTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const analyzeAbort = new AbortController();

        try {
            const payload = buildAnalysisRequest({ mode, owner, repo, tree: treeToSend, readme: repoData?.readme, aiSettings: aiSettings ?? undefined });
            const payloadMessage = `${payload.sampled ? `Analyzing ${payload.selectedCount} of ${treeToSend.length} selected repository items` : ingestMsg}${payload.readmeTruncated ? "; using a README excerpt" : ""}`;
            setPipelineSteps((prev) => prev.map((step) => step.step === "ingest" ? { ...step, message: payloadMessage } : step));

            analyzeTimeoutId = setTimeout(() => analyzeAbort.abort(), 25_000);
            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload.body,
                signal: analyzeAbort.signal,
            });
            clearTimeout(analyzeTimeoutId);
            analyzeTimeoutId = null;
            if (!ownsRequest()) return;

            if (res.status === 429) {
                const rateLimitMsg = "Too many requests. Please try again later.";
                setPipelineSteps((prev) =>
                    prev.map((s) =>
                        s.status === "running" ? { ...s, status: "error" as const, message: rateLimitMsg } : s
                    )
                );
                updateView(previous => ({ ...previous, error: rateLimitMsg }));
                toast.error("Rate limit reached", {
                    id: toastId,
                    description: rateLimitMsg,
                    action: { label: "Add Token", onClick: () => setAISettingsOpen(true) },
                });
                return;
            }

            const contentType = res.headers.get("content-type");
            let analysisResult: RepositoryAnalysisResult | null = null;

            if (contentType?.includes("text/event-stream")) {
                // Handle SSE streaming (premium AI mode)
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                if (reader) {
                    let buffer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (!ownsRequest()) return;
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n\n");
                        buffer = lines.pop() ?? "";

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                let event;
                                try {
                                    event = JSON.parse(line.substring(6));
                                } catch {
                                    // Skip malformed events
                                    continue;
                                }
                                if (!event || typeof event !== "object") continue;
                                if (event.data) analysisResult = await resolveAnalysisResponse(event.data);
                                if (!ownsRequest()) return;
                                setPipelineSteps((prev) =>
                                    prev.map((s) => s.step === event.step ? { ...s, ...event } : s)
                                );
                            }
                        }
                    }
                }

            } else {
                // Handle JSON response (smart mode or premium fallback mode).
                // Always check res.ok before parsing — a 413 or other infra error
                // returns plain text, not JSON, and res.json() would throw.
                if (!res.ok) {
                    const bodyText = await res.text().catch(() => "");
                    if (res.status === 413)
                        throw new Error("Analysis request exceeds the size limit. Try a smaller selection.");
                    if (res.status === 408 || res.status === 504)
                        throw new Error("Analysis timed out. Try a smaller repo or add a GitHub token for faster access.");
                    let serverError = "";
                    try { const j = JSON.parse(bodyText); serverError = typeof j.error === "string" ? j.error : ""; } catch { /* plain text body */ }
                    throw new Error(serverError || `Analysis failed (HTTP ${res.status}). Please try again.`);
                }
                let data: Record<string, unknown>;
                try {
                    data = await res.json();
                } catch {
                    throw new Error("Analysis failed — server returned an unexpected response. Please try again.");
                }
                if (data.error) throw new Error(data.error as string);

                analysisResult = await resolveAnalysisResponse(data);
            }

            if (!ownsRequest()) return;
            if (!analysisResult || (mode === "smart" && analysisResult.source !== "smart")) {
                throw new Error("Analysis did not return a valid result for this mode.");
            }
            const premiumFallback = mode === "premium" && analysisResult.source !== "ai";
            setPipelineSteps([
                { step: "ingest", status: "complete", message: payloadMessage },
                { step: "understand", status: "complete", message: analysisResult.source === "ai" ? "AI diagram syntax validated" : "Smart diagram ready" },
                { step: "enrich", status: "complete", message: analysisResult.metadataSource === "ai" ? "AI project details ready" : "Deterministic project details ready" },
            ]);

            const previousPremium = currentView?.results.premium?.result ?? cached;
            const fallbackReason = analysisResult.fallbackReason ?? "Premium AI unavailable. The diagram uses Smart analysis.";
            if (premiumFallback) updateView(previous => ({ ...previous, error: fallbackReason }));
            if (premiumFallback && previousPremium) {
                if (!currentView?.results.premium) storeResult(previousPremium, true);
                toast.warning("Premium AI unavailable", { id: toastId, description: "Showing cached diagram" });
            } else {
                storeResult(analysisResult);
                if (mode === "premium") {
                    const source = analysisResult.source === "ai" ? "ai" : "fallback";
                    cacheDiagram(owner, repo, { architecture: analysisResult.architecture, annotations: analysisResult.annotations, metadataSource: analysisResult.metadataSource }, source, cacheOpts);
                    if (source === "ai") {
                        toast.success("Premium AI diagram generated", {
                            id: toastId,
                            description: analysisResult.metadataSource === "ai" ? "Diagram syntax validated; AI project details ready" : "Diagram syntax validated; project details use Smart analysis",
                        });
                    } else {
                        toast.warning("Premium AI unavailable", { id: toastId, description: analysisResult.fallbackReason ?? "Showing a Smart diagram" });
                    }
                }
            }
        } catch (err) {
            if (!ownsRequest()) return;
            const rawMsg = err instanceof Error ? err.message : String(err);
            const errorMsg = (err instanceof Error && err.name === "AbortError")
                ? "Analysis timed out. Try a smaller repo or add a GitHub token for faster access."
                : /Unexpected token|is not valid JSON/i.test(rawMsg)
                ? "Analysis failed — server returned an unexpected response. Please try again."
                : rawMsg;
            setPipelineSteps((prev) =>
                prev.map((s) =>
                    s.status === "running"
                        ? { ...s, status: "error" as const, message: errorMsg }
                        : s
                )
            );
            updateView(previous => ({ ...previous, error: errorMsg }));
            // Never discard a valid session result just because a retry failed.
            if (mode === "premium") {
                if (cached && !currentView?.results.premium) {
                    storeResult(cached, true);
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
            if (analyzeTimeoutId !== null) clearTimeout(analyzeTimeoutId);
            if (ownsRequest()) {
                analysisSession.pendingMode = null;
                analysisSession.toastId = undefined;
                updateView(previous => ({ ...previous, requestMode: null }));
            }
        }
    }, [analysisTree, analysisSession, currentView?.results.premium, repoData?.snapshot, repoData?.readme, owner, repo, aiSettings]);

    const showNormalDiagram = useCallback(() => {
        if (!analysisSession.active) return;
        if (!currentView?.results.smart) {
            void runAnalysis("smart");
            return;
        }
        analysisSession.generation++;
        analysisSession.pendingMode = null;
        if (analysisSession.toastId !== undefined) toast.dismiss(analysisSession.toastId);
        analysisSession.toastId = undefined;
        setAnalysisView(previous => previous?.session === analysisSession ? { ...previous, selectedMode: "smart", requestMode: null, error: null } : previous);
    }, [analysisSession, currentView?.results.smart, runAnalysis]);

    // Load on mount — cleanup aborts the stream if the component unmounts or the
    // effect re-fires (e.g. React StrictMode double-invoke or owner/repo change).
    useEffect(() => {
        fetchData();
        return () => {
            abortRef.current?.abort();
        };
    }, [fetchData]);

    // At most one automatic attempt per repository/credential/tree session.
    // Explicit recovery actions remain available after either fetch or render failure.
    useEffect(() => {
        if (analysisTree && !analysisSession.attempted) void runAnalysis("smart");
    }, [analysisTree, analysisSession, runAnalysis]);

    useEffect(() => {
        setAISettings(loadAISettings());
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

    const diagramBackground = activeTab === "architecture" ? "diagram-dot-field" : activeTab === "files" ? "diagram-grid" : "";

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
        if (repoData?.snapshot?.status === "empty") return <div role="status" className="architecture-state text-sm text-muted-foreground">This repository has no commits yet. There is no code snapshot to display.</div>;
        if (emptyTree) return <div role="status" className="architecture-state text-sm text-muted-foreground">This snapshot contains no files.</div>;
        if (!analysisTree && !isAnalyzing) return <div className="architecture-state text-muted-foreground text-sm">No data available for this view.</div>;
        const displayedMode = analysis?.source === "ai" ? "Premium" : "Smart";
        const previous = Boolean(analysis && (displayedResult !== selectedResult || ((isAnalyzing || currentView?.error) && displayedResult?.generation !== currentView?.generation)));
        return (
            <div className="flex h-full min-h-0 min-w-0 flex-col">
                {previous && <p role="status" className="shrink-0 px-3 py-2 text-sm text-muted-foreground">Showing previous {displayedMode} diagram{isAnalyzing ? ` while ${selectedMode === "premium" ? "Premium" : "Smart"} analysis runs.` : "."}</p>}
                {currentView?.error && <p role="alert" className="shrink-0 px-3 py-2 text-sm text-destructive break-words">{currentView.error}</p>}
                <div className="flex-1 min-h-0 min-w-0">
                    {analysis ? (
                        <ArchitectureDiagram
                            key={`${analysis.source}-${displayedResult?.generation}`}
                            analysis={analysis.architecture}
                            source={analysis.source}
                            owner={owner}
                            repo={repo}
                            defaultBranch={repoData?.snapshot?.status === "ready" ? repoData.snapshot.commitSha : repoData?.metadata.defaultBranch ?? "main"}
                            tree={analysisTree?.tree}
                            onFallback={() => selectedMode === "premium" ? showNormalDiagram() : void runAnalysis("smart")}
                        />
                    ) : (
                        <div className="architecture-state">
                            <PipelineStatusDisplay steps={currentView?.steps ?? []} />
                        </div>
                    )}
                </div>
            </div>
        );
    }, [analysis, analysisTree, emptyTree, currentView, displayedResult, isAnalyzing, owner, repo, repoData?.metadata.defaultBranch, repoData?.snapshot, runAnalysis, selectedMode, selectedResult, showNormalDiagram]);

    const filesTabContent = useMemo(() => {
        if (emptyTree) return <div role="status" className="architecture-state text-sm text-muted-foreground">This snapshot contains no files.</div>;
        if (repoData?.snapshot?.status === "empty") return <div role="status" className="architecture-state text-sm text-muted-foreground">This repository has no commits yet. There is no code snapshot to display.</div>;
        if (repoData?.fileTree) {
            return (
                <div className="relative h-full w-full">
                    
                    <FileTreeGraph
                        tree={repoData.fileTree.tree}
                        owner={owner}
                        repo={repo}
                        githubToken={githubToken}
                        fileTypeLegend={fileTypeLegend}
                        snapshot={repoData.snapshot}
                    />
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No data available for this view.
            </div>
        );
    }, [emptyTree, fileTypeLegend, owner, repo, repoData?.fileTree, repoData?.snapshot, githubToken]);

    const contributorsTabContent = useMemo(
        () => (
            <ContributorsNetwork
                contributors={repoData?.contributors ?? []}
                truncated={repoData?.contributorsTruncated}
                fetchError={repoData?.contributorsFetchError}
            />
        ),
        [repoData?.contributors, repoData?.contributorsTruncated, repoData?.contributorsFetchError]
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
                githubToken={githubToken}
                branches={repoData.branches}
                commits={repoData.commits}
                commitsFetchError={repoData.commitsFetchError}
                snapshot={repoData.snapshot}
                defaultBranch={repoData.metadata.defaultBranch}
                owner={owner}
                repo={repo}
            />
        );
    }, [owner, repo, repoData, githubToken]);

    const dependenciesTabContent = useMemo(
        () => <DependencyGraph dependencies={dependencies} />,
        [dependencies]
    );

    const openOnboarding = useCallback(() => {
        setShowOnboarding(true);
    }, []);

    const closeOnboarding = useCallback(() => {
        setShowOnboarding(false);
    }, []);

    // Loading state
    if (loading) {
        // Cached repos already have data locally; avoid clone messaging on refresh.
        if (cachedLoad) {
            return (
                <div className="atlas-loading">
                    <div className="atlas-loading-content">
                        <div className="loading-repo-heading">
                            <BrandLogo size={32} className="shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">Gitvize</p>
                                <p className="loading-repo-name">{owner}/{repo}</p>
                            </div>
                        </div>
                        <div className="atlas-loading-card" aria-busy="true">
                            <h1>Opening repository</h1>
                            <p role="status" className="loading-cached-status">
                                <span className="loading-spinner animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                Opening cached repository data…
                            </p>
                        </div>
                        <Button asChild variant="outline" className="atlas-return"><Link href="/">Explore another repository</Link></Button>
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
        <div className="atlas-workspace">
            <Navbar
                owner={owner}
                repo={repo}
                onAISettings={() => setAISettingsOpen(true)}
                onGithubToken={() => setTokenModalOpen(true)}
                onExport={() => {
                    const dataStr = JSON.stringify(repoData, null, 2);
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${owner}-${repo}-gitvize.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }}
            />

            <div className="workspace-layout">
                <div className="workspace-heading">
                    <div className="workspace-identity min-w-0">
                        <h1 className="font-semibold truncate" title={`${owner}/${repo}`}><span>{owner} / </span>{repo}</h1>
                        {repoData.metadata.description && <p className="workspace-description" title={repoData.metadata.description}>{repoData.metadata.description}</p>}
                        {repoData.snapshot && <div role="note" aria-label="Repository snapshot" className="text-xs text-muted-foreground break-words">
                            {repoData.snapshot.status === "empty" ? "Empty repository" : <>Tree snapshot <code title={repoData.snapshot.commitSha}>{repoData.snapshot.commitSha.slice(0, 7)}</code></>} · Captured <time dateTime={repoData.snapshot.capturedAt}>{new Date(repoData.snapshot.capturedAt).toLocaleString()}</time>
                            {repoData.observations && <span className="block">Repository metrics observed <time dateTime={repoData.observations.metadata.observedAt}>{new Date(repoData.observations.metadata.observedAt).toLocaleString()}</time>; contributors and languages are live observations, not commit-specific.</span>}
                        </div>}
                    </div>
                    <div className="workspace-summary" aria-label="Repository summary">
                        <span><strong className="text-white">{repoData.fileTree?.tree.filter((item) => item.type === "blob").length.toLocaleString() ?? "0"}</strong> files</span>
                        <span><strong className="text-white">{repoData.contributors.length}</strong> contributors</span>
                        <span><strong className="text-white">{repoData.branches.length}</strong> branches</span>
                        <span><strong className="text-white">{repoData.metadata.defaultBranch}</strong> branch</span>
                    </div>
                </div>
                <TabNav
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    rightAction={
                        <button
                            type="button"
                            onClick={openOnboarding}
                            className="pro-control pro-focus-ring inline-flex items-center justify-center gap-2 px-3 text-sm shrink-0"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                            Help
                        </button>
                    }
                />

                <main className="workspace-canvas" aria-label={`${activeTab} view`}>
                    <header className="workspace-view-heading">
                        <div className="workspace-view-title">
                            <h2>{DIAGRAM_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
                            <p>{{ files: "Explore the structure. Select a file to read its code.", architecture: "See how the modules connect, then explore their key files.", contributors: "Find the people behind the code and their contributions.", branches: "Follow a branch and explore its commit history.", dependencies: "Inspect the packages this repository builds on." }[activeTab]}</p>
                        </div>
                        <Link href="/" className="workspace-new-repo">Explore another repo <span aria-hidden="true">↗</span></Link>
                    </header>
                    {/* Main diagram area */}
                    <div className="flex-1 min-h-0 min-w-0">
                        <div className={`relative h-full diagram-shell overscroll-contain surface-neo ${activeTab === "files" || activeTab === "architecture" ? "workspace-code" : "workspace-data"} ${diagramBackground}`}>
                            {isTabMounted("architecture") && (
                                <div
                                    className={`architecture-tab absolute inset-0 ${activeTab === "architecture" ? "pointer-events-auto" : "hidden pointer-events-none"}`}
                                    aria-hidden={activeTab !== "architecture"}
                                >
                                    <div className="architecture-content">{architectureTabContent}</div>
                                    {activeTab === "architecture" && (
                                        <div className="architecture-actions" role="group" aria-label="Architecture generation">
                                            {selectedMode === "premium" && (
                                                <Button variant="outline"
                                                    onClick={showNormalDiagram}
                                                >
                                                    Show Normal Diagram
                                                </Button>
                                            )}
                                            {(!analysis || currentView?.error) && (
                                                <Button variant="outline" disabled={!analysisTree || isAnalyzing} onClick={() => void runAnalysis("smart")}>
                                                    Retry Smart Diagram
                                                </Button>
                                            )}
                                            <Button variant="outline" disabled={!analysisTree || currentView?.requestMode === "premium"}
                                                onClick={() => {
                                                    if (!hasUserAIKey) {
                                                        setAISettingsOpen(true);
                                                        toast.info("Add your API key for premium diagrams");
                                                        return;
                                                    }
                                                    runAnalysis("premium");
                                                }}
                                            >
                                                Generate Premium Diagram
                                            </Button>
                                        </div>
                                    )}
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
                </main>
            </div>

            <AISettingsModal
                open={aiSettingsOpen}
                onOpenChange={setAISettingsOpen}
                onSave={(settings) => {
                    setAISettings(settings);
                    toast.success("AI key saved", {
                        description: "You can now generate premium architecture diagrams",
                    });
                }}
            />

            <GitHubTokenModal
                open={tokenModalOpen}
                onOpenChange={setTokenModalOpen}
                onSave={(token) => {
                    setDashboardToken(token);
                    setOneTimeGitHubToken(token);
                    toast.success("Token saved", {
                        description: "Rate limits increased.",
                        action: { label: "Reload", onClick: () => fetchData() },
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
