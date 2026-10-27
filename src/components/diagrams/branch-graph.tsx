"use client";

import { useState, useMemo, useCallback } from "react";
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
import CommitHistoryRail from "./commit-history-rail";
import type { Branch, Commit } from "@/types";

const BRANCH_COLOR = "var(--atlas-blue)";

interface BranchGraphProps {
    branches: Branch[];
    commits: Commit[];
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
    branches,
    commits: initialCommits,
    commitsFetchError = false,
    defaultBranch,
    owner,
    repo,
    githubToken,
}: BranchGraphProps) {
    const githubHeaders = useMemo((): Record<string, string> => githubToken ? { "x-github-token": githubToken } : {}, [githubToken]);
    const [view, setView] = useState<"timeline" | "history">("timeline");
    const [showAllBranches, setShowAllBranches] = useState(false);
    const [graphBranch, setGraphBranch] = useState<string | null>(null);
    const [showAllGraphBranches, setShowAllGraphBranches] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [branchQuery, setBranchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "author">("newest");

    const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
    const [branchCommits, setBranchCommits] = useState<Commit[]>([]);
    const [isBranchLoading, setIsBranchLoading] = useState(false);

    // Pagination state
    const [allCommits, setAllCommits] = useState<Commit[]>(initialCommits);
    // We fetch up to 500 commits (5 pages) server-side; start pagination from page 5
    const [currentPage, setCurrentPage] = useState(initialCommits.length >= 500 ? 5 : 1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialCommits.length >= 500);
    const [isLoadingAll, setIsLoadingAll] = useState(false);

    const loadMoreCommits = useCallback(async () => {
        setIsLoadingMore(true);
        try {
            const nextPage = currentPage + 1;
            const params = new URLSearchParams({ owner, repo, sha: defaultBranch, per_page: "100", page: String(nextPage) });
            const res = await fetch(`/api/github/repo/commits?${params}`, { headers: githubHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const newCommits: Commit[] = await res.json();

            setAllCommits((prev) => [...prev, ...newCommits]);
            setCurrentPage(nextPage);
            if (newCommits.length < 100) setHasMore(false);
        } catch (err) {
            console.error("Failed to load more commits:", err);
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    }, [currentPage, defaultBranch, owner, repo, githubHeaders]);

    const loadAllCommits = useCallback(async () => {
        setIsLoadingAll(true);
        setIsLoadingMore(true);
        let page = currentPage + 1;
        let keepGoing = true;

        try {
            while (keepGoing) {
                const params = new URLSearchParams({ owner, repo, sha: defaultBranch, per_page: "100", page: String(page) });
                const res = await fetch(`/api/github/repo/commits?${params}`, { headers: githubHeaders });
                if (!res.ok) {
                    keepGoing = false;
                    break;
                }
                const newCommits: Commit[] = await res.json();

                if (newCommits.length === 0) {
                    keepGoing = false;
                    break;
                }

                setAllCommits((prev) => [...prev, ...newCommits]);
                setCurrentPage(page);

                if (newCommits.length < 100) {
                    keepGoing = false;
                }
                page++;
            }
        } catch (err) {
            console.error("Failed to load all commits:", err);
        } finally {
            setHasMore(false);
            setIsLoadingMore(false);
            setIsLoadingAll(false);
        }
    }, [currentPage, defaultBranch, owner, repo, githubHeaders]);

    const fetchBranchCommits = useCallback(async (branch: string) => {
        setSelectedBranch(branch);
        if (branch === defaultBranch) {
            setBranchCommits([]);
            return;
        }
        setIsBranchLoading(true);
        try {
            const params = new URLSearchParams({ owner, repo, sha: branch, per_page: "100", page: "1" });
            const res = await fetch(`/api/github/repo/commits?${params}`, { headers: githubHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const commits: Commit[] = await res.json();
            setBranchCommits(commits);
        } catch (err) {
            console.error("Failed to fetch branch commits:", err);
            setBranchCommits([]);
        } finally {
            setIsBranchLoading(false);
        }
    }, [defaultBranch, owner, repo, githubHeaders]);

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
            {commitsFetchError && (
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

                            <CommitHistoryRail commits={allCommits} defaultBranch={defaultBranch} branches={branches} selectedBranchOverride={graphBranch} />
                        </div>
                    </div>

                    {hasMore && (
                        <div className="branch-history-pagination">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="branch-pagination-count text-xs text-muted-foreground">
                                    <GitCommit className="w-3.5 h-3.5" />
                                    <span>{allCommits.length} loaded on <span className="branch-name">{defaultBranch}</span></span>
                                    <span className="text-muted-foreground/50">• more available</span>
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
                                                disabled={isLoadingMore}
                                            >
                                                {isLoadingMore ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )}
                                                +100
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadAllCommits}
                                                disabled={isLoadingMore}
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

                                {isBranchLoading ? (
                                    <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading commits for {selectedBranch}…
                                    </div>
                                ) : displayCommits.length === 0 ? (
                                    <div className="text-center py-12 text-sm text-muted-foreground">
                                        {commitsFetchError && selectedBranch === defaultBranch && !searchQuery ? "Commit history is unavailable." : "No commits match your search."}
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
                                {!isBranchLoading && !searchQuery && displayCommits.length > 0 && (selectedBranch !== defaultBranch || !hasMore) && (
                                    <div className="flex items-center gap-3 ml-1 pt-4 pb-2">
                                        <div className="w-[10px] h-[10px] rounded-full bg-muted-foreground/20 border-2 border-background z-10" />
                                        <span className="text-xs text-muted-foreground">
                                            {selectedBranch === defaultBranch ? `${commitsFetchError ? "Available " : ""}${allCommits.length} commits loaded` : `${branchCommits.length} commits loaded for ${selectedBranch}${branchCommits.length === 100 ? " (first 100)" : ""}`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sticky Bottom Bar — always visible, no scrolling needed */}
                    {hasMore && (
                        <div className="branch-history-pagination">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="branch-pagination-count text-xs text-muted-foreground">
                                    <GitCommit className="w-3.5 h-3.5" />
                                    <span>{allCommits.length} loaded on <span className="branch-name">{defaultBranch}</span></span>
                                    <span className="text-muted-foreground/50">• more available</span>
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
                                                disabled={isLoadingMore}
                                            >
                                                {isLoadingMore ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )}
                                                +100
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadAllCommits}
                                                disabled={isLoadingMore}
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
