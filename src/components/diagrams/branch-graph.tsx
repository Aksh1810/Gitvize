"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitBranch,
    GitCommit,
    User,
    Calendar,
    ChevronDown,
    ChevronUp,
    Search,
    X,
    ArrowUpDown,
    Loader2,
    List,
    History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SectionNotice from "@/components/dashboard/section-notice";
import CommitHistoryRail from "./commit-history-rail";
import { createBranchHistory, historyCommits, mergeHistoryPage, commitHistoryPageSchema, MAX_LOAD_ALL_REQUESTS, MAX_HISTORY_PAGES } from "@/lib/branch-history";
import { repositorySnapshotKey, gitShaSchema } from "@/lib/repository-snapshot";
import type { SectionResult, Branch, Commit, RepositorySnapshot, BranchHistory, HistoryPageResult } from "@/types";

const BRANCH_COLOR = "var(--atlas-blue)";

interface BranchGraphProps {
    snapshot?: RepositorySnapshot;
    branches: Branch[];
    branchSection?: SectionResult<Branch[]>;
    commits?: Commit[];
    graphCommits?: Commit[];
    defaultHistory?: BranchHistory;
    branchHistories?: Record<string, BranchHistory>;
    commitsFetchError?: boolean;
    defaultBranch: string;
    owner: string;
    repo: string;
    githubToken?: string | null;
}

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

function groupCommitsByDate(commits: Commit[]): Map<string, Commit[]> {
    const groups = new Map<string, Commit[]>();
    commits.forEach((c) => {
        const date = new Date(c.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(c);
    });
    return groups;
}

function BranchPicker({ branches, defaultBranch, selectedBranch, query, onQueryChange, expanded, onToggleExpanded, onSelect }: {
    branches: Branch[];
    defaultBranch: string;
    selectedBranch: string | null;
    query: string;
    onQueryChange: (query: string) => void;
    expanded: boolean;
    onToggleExpanded: () => void;
    onSelect: (branch: string) => void;
}) {
    const defaultIsLoaded = branches.some(branch => branch.name === defaultBranch);
    const otherBranches = branches.filter(branch => branch.name !== defaultBranch);
    const matches = otherBranches.filter(branch => branch.name.toLowerCase().includes(query.trim().toLowerCase()));
    const displayed = expanded ? matches : matches.slice(0, 6);

    return (
        <section className="atlas-branch-card" aria-label="Branch picker">
            <div className="branch-picker-controls">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-sm font-semibold">Branches</h3>
                </div>
                <div className="branch-search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <Input aria-label="Search other branches" placeholder="Search other branches..." value={query} onChange={event => onQueryChange(event.target.value)} className="pl-9 pr-10" />
                    {query && <Button variant="ghost" size="icon" aria-label="Clear branch search" className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => onQueryChange("")}><X className="w-4 h-4" /></Button>}
                </div>
                {matches.length > 6 && (
                    <Button variant="ghost" size="sm" onClick={onToggleExpanded}>
                        {expanded ? <>Show less <ChevronUp className="w-4 h-4" /></> : <>+{matches.length - 6} more <ChevronDown className="w-4 h-4" /></>}
                    </Button>
                )}
            </div>
            <p className="branch-counts" role="status" aria-label="Branch counts">
                {displayed.length + 1} shown · {branches.length} loaded{!defaultIsLoaded && " + default"}
            </p>
            <p className="branch-count-note">Default branch stays available. The repository may have additional branches.</p>
            <div className="branch-options" role="group" aria-label="Choose branch">
                <Button variant="outline" className="branch-option" aria-pressed={selectedBranch === defaultBranch} onClick={() => onSelect(defaultBranch)}>
                    <GitBranch className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="branch-name">{defaultBranch}</span>
                    <Badge variant="secondary" className="text-xs">default</Badge>
                </Button>
                {displayed.map(branch => (
                    <Button key={branch.name} variant="outline" className="branch-option" aria-pressed={selectedBranch === branch.name} onClick={() => onSelect(branch.name)}>
                        <GitBranch className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="branch-name">{branch.name}</span>
                    </Button>
                ))}
            </div>
            {query.trim() && matches.length === 0 && <p role="status" className="branch-picker-empty">No other branches match your search.</p>}
        </section>
    );
}

export default function BranchGraph({
    branches, branchSection,
    commits: legacyGraphCommits,
    graphCommits: initialGraphCommits,
    defaultHistory: initialDefaultHistory,
    branchHistories: initialBranchHistories,
    commitsFetchError = false,
    defaultBranch,
    owner,
    repo,
    githubToken,
    snapshot,
}: BranchGraphProps) {
    const snapshotIdentity = repositorySnapshotKey(snapshot);
    const githubHeaders = useMemo((): Record<string, string> => githubToken ? { "x-github-token": githubToken } : {}, [githubToken]);
    const [view, setView] = useState<"timeline" | "history">("timeline");
    const [showAllBranches, setShowAllBranches] = useState(false);
    const [graphBranch, setGraphBranch] = useState<string | null>(null);
    const [showAllGraphBranches, setShowAllGraphBranches] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [branchQuery, setBranchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "author">("newest");

    const [selection, setSelection] = useState({ branch: defaultBranch, defaultBranch, attempt: 0, retry: false });
    const selectedBranch = selection.defaultBranch === defaultBranch ? selection.branch : defaultBranch;
    const defaultHead = snapshot?.status === "ready" ? snapshot.commitSha : initialDefaultHistory?.headSha ?? branches.find(branch => branch.name === defaultBranch)?.headSha ?? branches.find(branch => branch.name === defaultBranch)?.sha;
    const candidateHead = selectedBranch === defaultBranch ? defaultHead : branches.find(branch => branch.name === selectedBranch)?.headSha ?? branches.find(branch => branch.name === selectedBranch)?.sha;
    const headSha = gitShaSchema.safeParse(candidateHead).success ? candidateHead! : null;
    const repositoryContext = useMemo(() => ({ owner, repo, headers: githubHeaders, snapshotIdentity }), [owner, repo, githubHeaders, snapshotIdentity]);
    const baseHistory = useMemo(() => {
        const initial = selectedBranch === defaultBranch ? initialDefaultHistory : initialBranchHistories?.[selectedBranch];
        return initial?.headSha === headSha ? createBranchHistory(selectedBranch, headSha, initial.pages, initial.perPage) : createBranchHistory(selectedBranch, headSha);
    }, [selectedBranch, defaultBranch, headSha, initialDefaultHistory, initialBranchHistories]);
    const [historyStore, setHistoryStore] = useState<{ context: typeof repositoryContext; histories: Record<string, BranchHistory> }>({ context: repositoryContext, histories: {} });
    const stored = historyStore.context === repositoryContext ? historyStore.histories[selectedBranch] : undefined;
    const currentHistory = stored?.headSha === headSha ? stored : baseHistory;
    const historyRef = useRef(currentHistory);
    historyRef.current = currentHistory;
    const allCommits = useMemo(() => historyCommits(currentHistory), [currentHistory]);
    const branchCommits = allCommits;
    const hasMore = currentHistory.nextPage !== null && !currentHistory.cutoff;
    const requestScope = useMemo(() => ({ context: repositoryContext, branch: selectedBranch, headSha, attempt: selection.attempt, active: false, controllers: new Set<AbortController>(), pending: false }), [repositoryContext, selectedBranch, headSha, selection.attempt]);
    const scopeRef = useRef(requestScope);
    scopeRef.current = requestScope;
    const requestIdRef = useRef(0);
    const [pagination, setPagination] = useState<{ scope: typeof requestScope; more: boolean; all: boolean } | null>(null);
    const isLoadingMore = pagination?.scope === requestScope && pagination.more;
    const isLoadingAll = pagination?.scope === requestScope && pagination.all;
    const isBranchLoading = Boolean(headSha && !currentHistory.pages[1] && !currentHistory.error) || Boolean(isLoadingMore && !allCommits.length);
    const branchError = !headSha && snapshot?.status !== "empty" ? "Captured branch head is unavailable. Reload the repository to retry." : currentHistory.error?.message ?? null;
    const graphCommits = useMemo(() => {
        const histories = historyStore.context === repositoryContext ? Object.values(historyStore.histories) : [];
        return [...new Map([...(initialGraphCommits ?? legacyGraphCommits ?? []), ...(initialDefaultHistory ? historyCommits(initialDefaultHistory) : []), ...histories.flatMap(historyCommits)].map(commit => [commit.sha, commit])).values()];
    }, [initialGraphCommits, legacyGraphCommits, initialDefaultHistory, historyStore, repositoryContext]);
    const railBranches = useMemo(() => branches.some(branch => branch.name === defaultBranch) || !defaultHead ? branches : [{ name: defaultBranch, sha: defaultHead, headSha: defaultHead, isDefault: true }, ...branches], [branches, defaultBranch, defaultHead]);

    const loadPages = useCallback(async (all: boolean) => {
        if (!requestScope.active || requestScope.pending || !requestScope.headSha || scopeRef.current !== requestScope) return;
        let history = historyRef.current;
        if (history.headSha !== requestScope.headSha || history.branch !== requestScope.branch || history.nextPage === null) return;
        const controller = new AbortController();
        const controllers = requestScope.controllers;
        controllers.add(controller);
        requestScope.pending = true;
        const requestId = ++requestIdRef.current;
        const ownsRequest = () => scopeRef.current === requestScope && requestScope.active && !controller.signal.aborted && requestId === requestIdRef.current;
        const save = (result: HistoryPageResult) => {
            history = mergeHistoryPage(history, result);
            const saved = history;
            if (ownsRequest()) setHistoryStore(previous => ownsRequest() ? { context: repositoryContext, histories: { ...(previous.context === repositoryContext ? previous.histories : {}), [requestScope.branch]: saved } } : previous);
        };
        setPagination({ scope: requestScope, more: true, all });
        try {
            for (let attempt = 0; attempt < (all ? MAX_LOAD_ALL_REQUESTS : 1) && history.nextPage !== null && ownsRequest(); attempt++) {
                const page = history.nextPage;
                let status = 502;
                try {
                    const params = new URLSearchParams({ owner, repo, sha: requestScope.headSha, per_page: String(history.perPage), page: String(page) });
                    const response = await fetch(`/api/github/repo/commits?${params}`, { headers: githubHeaders, signal: controller.signal });
                    if (!ownsRequest()) return;
                    status = response.ok ? 502 : response.status;
                    const body = await response.json().catch(() => null);
                    if (!ownsRequest()) return;
                    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Could not load this branch's commits (HTTP ${status}). Retry page ${page}.`);
                    const parsed = commitHistoryPageSchema.safeParse(body);
                    if (!parsed.success || parsed.data.headSha !== requestScope.headSha || parsed.data.page !== page || parsed.data.perPage !== history.perPage) throw new Error("History response does not match the captured branch. Retry this page.");
                    save(parsed.data);
                } catch (error) {
                    if (!ownsRequest()) return;
                    save({ status: "error", page, perPage: history.perPage, error: { status: status || 502, message: error instanceof Error ? error.message : "Could not load captured history. Retry this page." } });
                    break;
                }
            }
        } finally {
            controllers.delete(controller);
            if (ownsRequest()) {
                requestScope.pending = false;
                setPagination({ scope: requestScope, more: false, all: false });
            }
        }
    }, [owner, repo, githubHeaders, repositoryContext, requestScope]);

    useEffect(() => {
        requestScope.active = true;
        requestScope.pending = false;
        const controllers = requestScope.controllers;
        setSelectedCommit(null);
        setPagination({ scope: requestScope, more: false, all: false });
        if (requestScope.headSha && (!Object.keys(historyRef.current.pages).length || selection.retry)) void loadPages(false);
        return () => {
            requestScope.active = false;
            for (const controller of controllers) controller.abort();
            controllers.clear();
        };
    }, [requestScope, loadPages, selection.retry]);

    const fetchBranchCommits = useCallback((branch: string) => {
        setSelection(previous => ({ branch, defaultBranch, attempt: previous.attempt + 1, retry: branch === previous.branch }));
    }, [defaultBranch]);
    const loadMoreCommits = () => void loadPages(false);
    const loadAllCommits = () => void loadPages(true);

    const filteredCommits = useMemo(() => {
        let result = [...(selectedBranch === defaultBranch ? allCommits : branchCommits)];

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(
                (c) =>
                    c.message.toLowerCase().includes(q) ||
                    c.authorName.toLowerCase().includes(q) ||
                    c.shortSha.toLowerCase().includes(q) ||
                    c.sha.toLowerCase().includes(q)
            );
        }

        if (sortBy === "oldest") {
            result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        } else if (sortBy === "newest") {
            result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } else if (sortBy === "author") {
            result.sort((a, b) => a.authorName.localeCompare(b.authorName));
        }

        return result;
    }, [allCommits, branchCommits, selectedBranch, defaultBranch, searchQuery, sortBy]);

    const displayCommits = filteredCommits;

    const groupedCommits = useMemo(
        () => groupCommitsByDate(displayCommits),
        [displayCommits]
    );

    return (
        <div className="branch-history">
            <SectionNotice section={branchSection} label="Branches" />
            {commitsFetchError && (view === "history" || !branchError) && (
                <p role="alert" className="branch-history-alert text-sm text-muted-foreground">
                    Commit history could not be fully loaded. Available commits are shown; reload the repository to try again.
                </p>
            )}
            <div className="branch-history-toolbar">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-semibold">History</span>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label="History view">
                    <Button type="button" variant="outline" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}><List className="w-4 h-4" />Commits</Button>
                    <Button type="button" variant="outline" aria-pressed={view === "history"} onClick={() => setView("history")}><History className="w-4 h-4" />Graph</Button>
                </div>
            </div>

            {view === "history" ? (
                <>
                    <div className="branch-history-scroll custom-scrollbar">
                        <div className="branch-history-content">

                            {/* Branches Section */}
                            <BranchPicker branches={branches} defaultBranch={defaultBranch} selectedBranch={graphBranch} query={branchQuery} onQueryChange={setBranchQuery}
                                expanded={showAllGraphBranches} onToggleExpanded={() => setShowAllGraphBranches(!showAllGraphBranches)}
                                onSelect={branch => setGraphBranch(graphBranch === branch ? null : branch)} />

                            <CommitHistoryRail commits={graphCommits} defaultBranch={defaultBranch} branches={railBranches} selectedBranchOverride={graphBranch} />
                        </div>
                    </div>

                    {(hasMore || currentHistory.cutoff) && (
                        <div className="branch-history-pagination">
                            <p className="text-xs text-muted-foreground">Load all requests up to {MAX_LOAD_ALL_REQUESTS} more pages per pass, within the {MAX_HISTORY_PAGES}-page limit.</p>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="branch-pagination-count text-xs text-muted-foreground">
                                    <GitCommit className="w-3.5 h-3.5" />
                                    <span>{allCommits.length} loaded on <span className="branch-name">{selectedBranch}</span></span>
                                    <span className="text-muted-foreground/50">{currentHistory.cutoff ? `• history limited to ${MAX_HISTORY_PAGES} pages (up to 5,000 commits)` : "• more available"}</span>
                                </div>

                                <div className="branch-pagination-actions">
                                    {isLoadingAll ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />
                                            <span>Loading... {allCommits.length}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadMoreCommits}
                                                aria-label={currentHistory.error ? `Retry history page ${currentHistory.nextPage}` : undefined}
                                                disabled={isLoadingMore || currentHistory.cutoff}
                                            >
                                                {isLoadingMore ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )}
                                                {currentHistory.error ? `Retry page ${currentHistory.nextPage}` : "+100"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadAllCommits}
                                                disabled={isLoadingMore || currentHistory.cutoff}
                                            >
                                                <GitCommit className="w-3 h-3" />
                                                Load all
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Scrollable content */}
                    <div className="branch-history-scroll custom-scrollbar">
                        <div className="branch-history-content">

                            {/* Branches Section */}
                            <BranchPicker branches={branches} defaultBranch={defaultBranch} selectedBranch={selectedBranch} query={branchQuery} onQueryChange={setBranchQuery}
                                expanded={showAllBranches} onToggleExpanded={() => setShowAllBranches(!showAllBranches)} onSelect={fetchBranchCommits} />

                            {/* Commits Header */}
                            <div className="branch-commits-controls">
                                <div className="flex flex-wrap items-center gap-2">
                                    <GitCommit className="w-4 h-4 text-muted-foreground" />
                                    <h3 className="text-sm font-semibold">Commits</h3>
                                    {isBranchLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                    ) : (
                                        <Badge variant="secondary" className="text-xs">
                                            {selectedBranch === defaultBranch ? `${allCommits.length}${hasMore ? "+" : ""}` : branchCommits.length}
                                        </Badge>
                                    )}
                                    {selectedBranch !== defaultBranch && (
                                        <span className="text-xs text-muted-foreground">on <span className="branch-name">{selectedBranch}</span></span>
                                    )}
                                </div>

                                <div className="branch-commit-actions">
                                    <div className="relative flex items-center">
                                        <ArrowUpDown className="absolute left-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
                                        <select
                                            aria-label="Sort commits"
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "author")}
                                            className="branch-sort"
                                        >
                                            <option value="newest">Newest first</option>
                                            <option value="oldest">Oldest first</option>
                                            <option value="author">Author A-Z</option>
                                        </select>
                                    </div>

                                    <div className="branch-search">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            type="text"
                                            placeholder="Search commits..."
                                            aria-label="Search commits"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 pr-10"
                                        />
                                        {searchQuery && (
                                            <Button variant="ghost" size="icon"
                                                aria-label="Clear commit search"
                                                onClick={() => setSearchQuery("")}
                                                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Commit Timeline */}
                            <div className="relative">
                                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/40" />

                                {branchError && <p role="alert" className="branch-history-alert text-sm text-muted-foreground">{branchError}</p>}
                                {isBranchLoading ? (
                                    <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading commits for {selectedBranch}…
                                    </div>
                                ) : displayCommits.length === 0 ? (
                                    !branchError && <div className="text-center py-12 text-sm text-muted-foreground">
                                        {searchQuery ? "No commits match your search." : currentHistory.complete ? "No commits in this captured history." : "No commits loaded yet."}
                                    </div>
                                ) : (
                                    Array.from(groupedCommits.entries()).map(([date, dayCommits]) => (
                                        <div key={date} className="mb-6">
                                            <div className="flex items-center gap-3 mb-3 ml-1">
                                                <div className="w-[10px] h-[10px] rounded-full bg-muted-foreground/30 border-2 border-background z-10" />
                                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                    {date}
                                                </span>
                                            </div>

                                            <div className="space-y-1 ml-10">
                                                {dayCommits.map((commit) => (
                                                    <motion.button
                                                        key={commit.sha}
                                                        type="button"
                                                        aria-expanded={selectedCommit?.sha === commit.sha}
                                                        initial={{ opacity: 0, x: -8 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        className="branch-commit group relative flex w-full text-left items-start gap-3 p-3 cursor-pointer transition-colors"
                                                        onClick={() =>
                                                            setSelectedCommit(
                                                                selectedCommit?.sha === commit.sha ? null : commit
                                                            )
                                                        }
                                                    >
                                                        <div className="absolute -left-[30px] top-4 w-[20px] h-px bg-border/30" />
                                                        <div
                                                            className="absolute -left-[34px] top-[12px] w-[8px] h-[8px] rounded-full border-2 z-10"
                                                            style={{
                                                                borderColor: BRANCH_COLOR,
                                                                background: selectedCommit?.sha === commit.sha ? BRANCH_COLOR : "var(--atlas-surface)",
                                                            }}
                                                        />

                                                        {commit.authorAvatar ? (
                                                            <img
                                                                src={commit.authorAvatar}
                                                                alt={commit.authorName}
                                                                className="w-7 h-7 rounded-full shrink-0 mt-0.5"
                                                            />
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-full bg-secondary/50 flex items-center justify-center shrink-0 mt-0.5">
                                                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                            </div>
                                                        )}

                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm text-foreground leading-snug transition-colors ${selectedCommit?.sha === commit.sha ? "whitespace-pre-wrap break-words" : "truncate"}`} title={commit.message}>
                                                                {commit.message}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                <span className="branch-commit-meta text-xs text-muted-foreground">
                                                                    {commit.authorName}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground/50">•</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {timeAgo(commit.date)}
                                                                </span>
                                                            </div>

                                                            <AnimatePresence>
                                                                {selectedCommit?.sha === commit.sha && (
                                                                    <motion.div
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        transition={{ duration: 0.2 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="mt-2 pt-2 border-t border-border/20 space-y-1.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <Calendar className="w-3 h-3 text-muted-foreground" />
                                                                                <span className="branch-commit-meta text-xs text-muted-foreground">
                                                                                    {new Date(commit.date).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <GitBranch className="w-3 h-3 text-muted-foreground" />
                                                                                <Badge variant="outline" className="branch-name text-xs">
                                                                                    {selectedBranch}
                                                                                </Badge>
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>

                                                        <code className="text-xs text-muted-foreground px-1.5 py-0.5 rounded font-mono shrink-0 mt-1">
                                                            {commit.shortSha}
                                                        </code>
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* End marker */}
                                {!branchError && !isBranchLoading && !searchQuery && displayCommits.length > 0 && (!hasMore && !currentHistory.cutoff) && (
                                    <div className="flex items-center gap-3 ml-1 pt-4 pb-2">
                                        <div className="w-[10px] h-[10px] rounded-full bg-muted-foreground/20 border-2 border-background z-10" />
                                        <span className="text-xs text-muted-foreground">
                                            {selectedBranch === defaultBranch ? `${commitsFetchError ? "Available " : ""}${allCommits.length} commits loaded` : `${branchCommits.length} commits loaded for ${selectedBranch}`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sticky Bottom Bar — always visible, no scrolling needed */}
                    {(hasMore || currentHistory.cutoff) && (
                        <div className="branch-history-pagination">
                            <p className="text-xs text-muted-foreground">Load all requests up to {MAX_LOAD_ALL_REQUESTS} more pages per pass, within the {MAX_HISTORY_PAGES}-page limit.</p>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="branch-pagination-count text-xs text-muted-foreground">
                                    <GitCommit className="w-3.5 h-3.5" />
                                    <span>{allCommits.length} loaded on <span className="branch-name">{selectedBranch}</span></span>
                                    <span className="text-muted-foreground/50">{currentHistory.cutoff ? `• history limited to ${MAX_HISTORY_PAGES} pages (up to 5,000 commits)` : "• more available"}</span>
                                </div>

                                <div className="branch-pagination-actions">
                                    {isLoadingAll ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />
                                            <span>Loading... {allCommits.length}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadMoreCommits}
                                                aria-label={currentHistory.error ? `Retry history page ${currentHistory.nextPage}` : undefined}
                                                disabled={isLoadingMore || currentHistory.cutoff}
                                            >
                                                {isLoadingMore ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )}
                                                {currentHistory.error ? `Retry page ${currentHistory.nextPage}` : "+100"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadAllCommits}
                                                disabled={isLoadingMore || currentHistory.cutoff}
                                            >
                                                <GitCommit className="w-3 h-3" />
                                                Load all
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
