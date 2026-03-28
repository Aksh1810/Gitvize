"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    GitBranch,
    GitMerge,
    GitPullRequest,
    User,
    ChevronDown,
    Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MergedPR } from "@/types";

const COLORS = [
    "#6366f1", "#22d3ee", "#a855f7", "#10b981",
    "#f59e0b", "#ef4444", "#ec4899", "#3b82f6",
];

const MAIN_X = 20;
const ARC_W = 22;

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

interface GitRailGraphProps {
    mergedPRs: MergedPR[];
    defaultBranch: string;
    owner: string;
    repo: string;
}

export default function GitRailGraph({
    mergedPRs: initialPRs,
    defaultBranch,
    owner,
    repo,
}: GitRailGraphProps) {
    const [allPRs, setAllPRs] = useState<MergedPR[]>(initialPRs);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialPRs.length >= 10);
    const [selectedPRNumber, setSelectedPRNumber] = useState<number | null>(null);

    const sortedPRs = useMemo(
        () => [...allPRs].sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime()),
        [allPRs]
    );

    function arcPath(cy: number): string {
        const topY = cy - 14;
        const botY = cy + 14;
        const peakX = MAIN_X + ARC_W;
        return `M ${MAIN_X} ${topY} C ${peakX} ${topY}, ${peakX} ${botY}, ${MAIN_X} ${botY}`;
    }

    // Keep colors stable even after loading more / refresh by hashing branch name.
    function colorForBranch(branchName: string): string {
        let hash = 0;
        for (let i = 0; i < branchName.length; i++) {
            hash = (hash * 31 + branchName.charCodeAt(i)) >>> 0;
        }
        return COLORS[hash % COLORS.length];
    }

    // Reset transient selection when repo/source data changes.
    useEffect(() => {
        setSelectedPRNumber(null);
    }, [owner, repo, initialPRs]);

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
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border/20">
                <GitMerge className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold">Merged Branches</span>
                <Badge variant="secondary" className="text-[10px]">{allPRs.length}</Badge>
                <div className="flex-1" />
                {/* Legend */}
                <div className="hidden sm:flex items-center gap-4 text-[10px] text-muted-foreground/50">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-500/70" />
                        merge on <code className="text-indigo-400 text-[9px]">{defaultBranch}</code>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <svg width="14" height="10" className="shrink-0">
                            <path d="M7 1 C13 1, 13 9, 7 9" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
                        </svg>
                        feature branch
                    </span>
                </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto custom-scrollbar px-2 sm:px-4 py-1.5">
                <div className="min-w-0">
                    {sortedPRs.map((pr) => {
                        const color = colorForBranch(pr.headBranch);
                        const isSelected = selectedPRNumber === pr.number;
                        const railH = isSelected ? 86 : 58;

                        return (
                            <motion.div
                                key={pr.number}
                                layout
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="grid grid-cols-[38px_minmax(0,1fr)] gap-2 mb-1"
                            >
                                <svg width="38" height={railH} className="shrink-0" overflow="visible">
                                    <line
                                        x1={MAIN_X}
                                        y1={0}
                                        x2={MAIN_X}
                                        y2={railH}
                                        stroke="#6366f1"
                                        strokeWidth={2}
                                        strokeOpacity={0.35}
                                    />
                                    <path
                                        d={arcPath(railH / 2)}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={isSelected ? 2 : 1.5}
                                        strokeOpacity={isSelected ? 0.85 : 0.45}
                                        strokeLinecap="round"
                                    />
                                    <circle
                                        cx={MAIN_X}
                                        cy={railH / 2}
                                        r={5}
                                        fill={isSelected ? color : "#0a0e1a"}
                                        stroke={color}
                                        strokeWidth={2}
                                    />
                                </svg>

                                <motion.div
                                    layout
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className={`w-full rounded-lg px-3 py-2 cursor-pointer transition-all border ${
                                        isSelected
                                            ? "border-border/30"
                                            : "border-transparent hover:border-border/15 hover:bg-white/[0.02]"
                                    }`}
                                    style={{
                                        background: isSelected ? `${color}08` : "transparent",
                                        borderColor: isSelected ? `${color}25` : "transparent",
                                    }}
                                    onClick={() => setSelectedPRNumber(isSelected ? null : pr.number)}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {pr.authorAvatar ? (
                                            <img src={pr.authorAvatar} alt={pr.authorLogin} className="w-5 h-5 rounded-full shrink-0" />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                                                <User className="w-3 h-3 text-muted-foreground" />
                                            </div>
                                        )}
                                        {isSelected ? (
                                            <a
                                                href={pr.htmlUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-foreground truncate flex-1 hover:underline underline-offset-2"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {pr.title}
                                            </a>
                                        ) : (
                                            <span className="text-sm text-foreground/90 truncate flex-1">{pr.title}</span>
                                        )}
                                        <Badge variant="outline" className="text-[9px] shrink-0 opacity-40">#{pr.number}</Badge>
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap ml-7">
                                        <span
                                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono"
                                            style={{ color, background: `${color}15` }}
                                        >
                                            <GitBranch className="w-2.5 h-2.5" />
                                            <span className="max-w-[120px] truncate">{pr.headBranch}</span>
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/40">to {pr.baseBranch}</span>
                                        <span className="text-[10px] text-muted-foreground/30">·</span>
                                        <span className="text-[10px] text-muted-foreground/50">{pr.authorLogin}</span>
                                        <span className="text-[10px] text-muted-foreground/30">·</span>
                                        <span className="text-[10px] text-muted-foreground/40">{timeAgo(pr.mergedAt)}</span>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22, ease: "easeOut" }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-2 pt-2 border-t border-border/10 ml-7">
                                                    <span className="text-[11px] text-muted-foreground/50">
                                                        {new Date(pr.mergedAt).toLocaleString()}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            </motion.div>
                        );
                    })}

                    <div className="py-3 pl-[40px]">
                        {hasMore ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadMorePRs}
                                disabled={isLoadingMore}
                                className="h-7 text-xs gap-1.5 bg-secondary/30 border-border/30"
                            >
                                {isLoadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
                                Load more
                            </Button>
                        ) : (
                            <p className="text-[11px] text-muted-foreground/30">All {allPRs.length} merged PRs shown</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
