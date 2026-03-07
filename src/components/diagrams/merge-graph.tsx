"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitPullRequest,
    GitBranch,
    GitMerge,
    ExternalLink,
    User,
    ChevronDown,
    Loader2,
    ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MergedPR } from "@/types";

const BRANCH_COLORS = [
    "#6366f1", "#22d3ee", "#a855f7", "#10b981",
    "#f59e0b", "#ef4444", "#ec4899", "#3b82f6",
    "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4",
];

interface MergeGraphProps {
    mergedPRs: MergedPR[];
    defaultBranch: string;
    owner: string;
    repo: string;
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

export default function MergeGraph({
    mergedPRs: initialPRs,
    defaultBranch,
    owner,
    repo,
}: MergeGraphProps) {
    const [allPRs, setAllPRs] = useState<MergedPR[]>(initialPRs);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialPRs.length >= 10);
    const [selectedPR, setSelectedPR] = useState<MergedPR | null>(null);

    // Sort PRs newest first for top-to-bottom display
    const sortedPRs = useMemo(
        () => [...allPRs].sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime()),
        [allPRs]
    );

    // Assign colors to unique branch names
    const branchColorMap = useMemo(() => {
        const map = new Map<string, string>();
        const uniqueBranches = [...new Set(sortedPRs.map((pr) => pr.headBranch))];
        uniqueBranches.forEach((branch, i) => {
            map.set(branch, BRANCH_COLORS[i % BRANCH_COLORS.length]);
        });
        return map;
    }, [sortedPRs]);

    // Group by month for date separators
    const groupedPRs = useMemo(() => {
        const groups = new Map<string, MergedPR[]>();
        sortedPRs.forEach((pr) => {
            const d = new Date(pr.mergedAt);
            const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(pr);
        });
        return groups;
    }, [sortedPRs]);

    // Load more PRs
    const loadMorePRs = useCallback(async () => {
        setIsLoadingMore(true);
        try {
            const nextPage = currentPage + 1;
            const res = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=${nextPage}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any[] = await res.json();
            const newPRs: MergedPR[] = data
                .filter((pr) => pr.merged_at !== null)
                .map((pr) => ({
                    number: pr.number,
                    title: pr.title,
                    headBranch: pr.head.ref,
                    baseBranch: pr.base.ref,
                    mergedAt: pr.merged_at,
                    authorLogin: pr.user?.login ?? "unknown",
                    authorAvatar: pr.user?.avatar_url ?? null,
                    mergedByLogin: pr.merged_by?.login ?? null,
                    mergedByAvatar: pr.merged_by?.avatar_url ?? null,
                    htmlUrl: pr.html_url,
                }));
            setAllPRs((prev) => [...prev, ...newPRs]);
            setCurrentPage(nextPage);
            if (data.length < 50) setHasMore(false);
        } catch {
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    }, [currentPage, owner, repo]);

    if (allPRs.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <GitPullRequest className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No merged pull requests found.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        This repo may not use pull requests for merging.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Scrollable merge timeline */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <div className="max-w-3xl mx-auto px-6 py-6">

                    {/* Stats bar */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center gap-2">
                            <GitMerge className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-semibold">Merge History</span>
                            <Badge variant="secondary" className="text-[10px]">
                                {allPRs.length} PRs
                            </Badge>
                        </div>
                        <div className="flex-1" />
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                            <GitBranch className="w-3 h-3" />
                            <span>into</span>
                            <code className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px]">
                                {defaultBranch}
                            </code>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="relative">
                        {/* Vertical spine */}
                        <div className="absolute left-[23px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-500/30 via-indigo-500/15 to-transparent" />

                        {Array.from(groupedPRs.entries()).map(([monthLabel, prs]) => (
                            <div key={monthLabel} className="mb-6">
                                {/* Month separator */}
                                <div className="flex items-center gap-3 mb-4 ml-0.5">
                                    <div className="w-[12px] h-[12px] rounded-full border-2 border-indigo-500/40 bg-[#0a0e1a] z-10" />
                                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        {monthLabel}
                                    </span>
                                    <div className="flex-1 h-px bg-border/10" />
                                    <span className="text-[10px] text-muted-foreground/40">{prs.length} merges</span>
                                </div>

                                {/* PR cards */}
                                <div className="space-y-2 ml-0">
                                    {prs.map((pr, idx) => {
                                        const color = branchColorMap.get(pr.headBranch) ?? "#6366f1";
                                        const isSelected = selectedPR?.number === pr.number;

                                        return (
                                            <motion.div
                                                key={pr.number}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                                                className="relative flex items-start gap-3 ml-1"
                                            >
                                                {/* Merge dot on spine */}
                                                <div className="relative shrink-0 mt-3">
                                                    <div
                                                        className="w-[10px] h-[10px] rounded-full border-2 z-10 relative cursor-pointer hover:scale-150 transition-transform"
                                                        style={{
                                                            borderColor: color,
                                                            background: isSelected ? color : "#0a0e1a",
                                                        }}
                                                        onClick={() => setSelectedPR(isSelected ? null : pr)}
                                                    />
                                                    {/* Horizontal connector */}
                                                    <div
                                                        className="absolute top-[4px] left-[10px] h-[2px] w-[14px]"
                                                        style={{ background: `${color}30` }}
                                                    />
                                                </div>

                                                {/* PR card */}
                                                <div
                                                    className={`flex-1 rounded-lg p-3 cursor-pointer transition-all group ${isSelected
                                                            ? "border bg-secondary/20"
                                                            : "hover:bg-secondary/10 border border-transparent"
                                                        }`}
                                                    style={{
                                                        borderColor: isSelected ? `${color}30` : undefined,
                                                    }}
                                                    onClick={() => setSelectedPR(isSelected ? null : pr)}
                                                >
                                                    {/* Top row: branch badge + time */}
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <div
                                                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono"
                                                            style={{
                                                                background: `${color}12`,
                                                                color: color,
                                                                border: `1px solid ${color}25`,
                                                            }}
                                                        >
                                                            <GitBranch className="w-2.5 h-2.5" />
                                                            {pr.headBranch.length > 30
                                                                ? pr.headBranch.slice(0, 29) + "…"
                                                                : pr.headBranch}
                                                        </div>
                                                        <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
                                                        <code className="text-[9px] text-muted-foreground/50 font-mono">
                                                            {pr.baseBranch}
                                                        </code>
                                                        <div className="flex-1" />
                                                        <span className="text-[10px] text-muted-foreground/40">
                                                            {timeAgo(pr.mergedAt)}
                                                        </span>
                                                    </div>

                                                    {/* PR title */}
                                                    <div className="flex items-center gap-2">
                                                        <GitMerge className="w-3.5 h-3.5 shrink-0 text-purple-400/60" />
                                                        <span className="text-sm text-foreground truncate group-hover:text-white transition-colors">
                                                            {pr.title}
                                                        </span>
                                                        <Badge variant="outline" className="text-[9px] shrink-0 opacity-50">
                                                            #{pr.number}
                                                        </Badge>
                                                    </div>

                                                    {/* Author row */}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        {pr.authorAvatar ? (
                                                            <img
                                                                src={pr.authorAvatar}
                                                                alt={pr.authorLogin}
                                                                className="w-5 h-5 rounded-full ring-1 ring-border/20"
                                                            />
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-secondary/50 flex items-center justify-center">
                                                                <User className="w-3 h-3 text-muted-foreground" />
                                                            </div>
                                                        )}
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {pr.authorLogin}
                                                        </span>
                                                        {pr.mergedByLogin && pr.mergedByLogin !== pr.authorLogin && (
                                                            <>
                                                                <span className="text-[10px] text-muted-foreground/30">•</span>
                                                                <span className="text-[10px] text-muted-foreground/50">
                                                                    merged by {pr.mergedByLogin}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Expanded details */}
                                                    <AnimatePresence>
                                                        {isSelected && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="mt-3 pt-3 border-t border-border/10 flex items-center gap-3">
                                                                    <span className="text-[11px] text-muted-foreground">
                                                                        {new Date(pr.mergedAt).toLocaleString()}
                                                                    </span>
                                                                    <div className="flex-1" />
                                                                    <a
                                                                        href={pr.htmlUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                        View on GitHub
                                                                    </a>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* End marker */}
                        {!hasMore && allPRs.length > 0 && (
                            <div className="flex items-center gap-3 ml-0.5 pt-2 pb-4">
                                <div className="w-[12px] h-[12px] rounded-full bg-muted-foreground/15 border-2 border-background z-10" />
                                <span className="text-[11px] text-muted-foreground/40">
                                    All {allPRs.length} merged PRs loaded
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Load more bar */}
            {hasMore && (
                <div className="shrink-0 border-t border-border/20 bg-[#0a0e1a]/95 backdrop-blur-xl px-6 py-2.5">
                    <div className="max-w-3xl mx-auto flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <GitPullRequest className="w-3.5 h-3.5" />
                            {allPRs.length} merged PRs loaded
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadMorePRs}
                            disabled={isLoadingMore}
                            className="h-7 text-xs gap-1.5 bg-secondary/30 border-border/30"
                        >
                            {isLoadingMore ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <ChevronDown className="w-3 h-3" />
                            )}
                            Load more PRs
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
