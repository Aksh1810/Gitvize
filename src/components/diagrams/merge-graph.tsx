"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitPullRequest,
    GitBranch,
    GitMerge,
    ExternalLink,
    User,
    ChevronDown,
    Loader2,
    ZoomIn,
    ZoomOut,
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
    const [scale, setScale] = useState(1);
    const [panX, setPanX] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    // Sort PRs oldest → newest for left-to-right layout
    const sortedPRs = useMemo(
        () => [...allPRs].sort((a, b) => new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime()),
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

    // Group PRs by month for the heatmap
    const monthlyActivity = useMemo(() => {
        const groups = new Map<string, number>();
        allPRs.forEach((pr) => {
            const d = new Date(pr.mergedAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            groups.set(key, (groups.get(key) ?? 0) + 1);
        });
        return Array.from(groups.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, count]) => ({ month, count }));
    }, [allPRs]);

    const maxMonthlyCount = Math.max(...monthlyActivity.map((m) => m.count), 1);

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

    // Pan handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastMouse.current.x;
        setPanX((prev) => prev + dx);
        lastMouse.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseUp = useCallback(() => {
        isDragging.current = false;
    }, []);

    // Zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale((prev) => Math.max(0.3, Math.min(2, prev + (e.deltaY > 0 ? -0.05 : 0.05))));
    }, []);

    // Layout constants
    const NODE_SPACING = 160;
    const MAIN_Y = 120;
    const BRANCH_Y = 240;
    const graphWidth = Math.max(sortedPRs.length * NODE_SPACING + 200, 800);

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

            {/* Activity heatmap bar */}
            {monthlyActivity.length > 1 && (
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/10">
                    <div className="flex items-center gap-2 mb-2">
                        <GitMerge className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Merge activity</span>
                    </div>
                    <div className="flex items-end gap-[2px] h-[28px]">
                        {monthlyActivity.map(({ month, count }) => {
                            const height = Math.max(4, (count / maxMonthlyCount) * 28);
                            const [year, mo] = month.split("-");
                            return (
                                <div
                                    key={month}
                                    className="group relative flex-1 min-w-[4px] max-w-[20px] cursor-default"
                                >
                                    <div
                                        className="w-full rounded-sm bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors"
                                        style={{ height: `${height}px` }}
                                    />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                                        <div className="glass-card px-2 py-1 text-[10px] whitespace-nowrap">
                                            {new Date(`${year}-${mo}-01`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                            : {count} merge{count !== 1 ? "s" : ""}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Git graph canvas */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <div
                    ref={canvasRef}
                    className="absolute top-0 left-0 h-full transition-transform duration-75"
                    style={{
                        transform: `translateX(${panX}px) scale(${scale})`,
                        transformOrigin: "left center",
                        width: `${graphWidth}px`,
                    }}
                >
                    {/* Main branch spine */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
                        {/* Main horizontal line */}
                        <line
                            x1={60}
                            y1={MAIN_Y}
                            x2={graphWidth - 40}
                            y2={MAIN_Y}
                            stroke="rgba(99, 102, 241, 0.3)"
                            strokeWidth={3}
                            strokeLinecap="round"
                        />

                        {/* Branch fork/merge curves */}
                        {sortedPRs.map((pr, i) => {
                            const x = 100 + i * NODE_SPACING;
                            const color = branchColorMap.get(pr.headBranch) ?? "#6366f1";

                            return (
                                <g key={pr.number}>
                                    {/* Fork down from main */}
                                    <path
                                        d={`M ${x} ${MAIN_Y} C ${x} ${MAIN_Y + 40}, ${x - 30} ${BRANCH_Y - 40}, ${x - 30} ${BRANCH_Y}`}
                                        stroke={color}
                                        strokeWidth={2}
                                        fill="none"
                                        strokeOpacity={0.3}
                                    />
                                    {/* Merge back up to main */}
                                    <path
                                        d={`M ${x - 30} ${BRANCH_Y} C ${x - 30} ${BRANCH_Y - 40}, ${x + 40} ${MAIN_Y + 40}, ${x + 40} ${MAIN_Y}`}
                                        stroke={color}
                                        strokeWidth={2}
                                        fill="none"
                                        strokeOpacity={0.3}
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    {/* Main branch label */}
                    <div
                        className="absolute flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border"
                        style={{
                            left: 10,
                            top: MAIN_Y - 14,
                            borderColor: "rgba(99, 102, 241, 0.3)",
                            background: "rgba(99, 102, 241, 0.1)",
                            color: "#6366f1",
                        }}
                    >
                        <GitBranch className="w-3 h-3" />
                        {defaultBranch}
                    </div>

                    {/* Merge points on main line */}
                    {sortedPRs.map((pr, i) => {
                        const x = 100 + i * NODE_SPACING + 40;
                        return (
                            <div
                                key={`main-${pr.number}`}
                                className="absolute w-3 h-3 rounded-full border-2 bg-[#0a0e1a] cursor-pointer hover:scale-150 transition-transform"
                                style={{
                                    left: x - 6,
                                    top: MAIN_Y - 6,
                                    borderColor: branchColorMap.get(pr.headBranch) ?? "#6366f1",
                                }}
                                onClick={() => setSelectedPR(selectedPR?.number === pr.number ? null : pr)}
                            />
                        );
                    })}

                    {/* Branch nodes (the feature branch circles with info) */}
                    {sortedPRs.map((pr, i) => {
                        const x = 100 + i * NODE_SPACING - 30;
                        const color = branchColorMap.get(pr.headBranch) ?? "#6366f1";
                        const isSelected = selectedPR?.number === pr.number;

                        return (
                            <motion.div
                                key={pr.number}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i * 0.03, 1) }}
                                className={`absolute cursor-pointer group`}
                                style={{
                                    left: x - 50,
                                    top: BRANCH_Y - 20,
                                    width: 120,
                                }}
                                onClick={() => setSelectedPR(isSelected ? null : pr)}
                            >
                                {/* Branch dot */}
                                <div className="flex flex-col items-center">
                                    <div
                                        className="w-4 h-4 rounded-full border-2 mb-2 group-hover:scale-125 transition-transform"
                                        style={{
                                            borderColor: color,
                                            background: isSelected ? color : "#0a0e1a",
                                        }}
                                    />

                                    {/* Branch name */}
                                    <div
                                        className="px-2 py-0.5 rounded text-[9px] font-mono truncate max-w-full text-center"
                                        style={{
                                            background: `${color}15`,
                                            color: color,
                                            border: `1px solid ${color}30`,
                                        }}
                                    >
                                        {pr.headBranch.length > 16
                                            ? pr.headBranch.slice(0, 15) + "…"
                                            : pr.headBranch}
                                    </div>

                                    {/* Author avatar */}
                                    {pr.authorAvatar && (
                                        <img
                                            src={pr.authorAvatar}
                                            alt={pr.authorLogin}
                                            className="w-5 h-5 rounded-full mt-1.5 ring-1 ring-border/20"
                                        />
                                    )}

                                    {/* Time label */}
                                    <span className="text-[9px] text-muted-foreground/50 mt-1">
                                        {timeAgo(pr.mergedAt)}
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Zoom controls */}
                <div className="absolute bottom-4 right-4 flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setScale((s) => Math.min(2, s + 0.15))}>
                        <ZoomIn className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setScale((s) => Math.max(0.3, s - 0.15))}>
                        <ZoomOut className="w-3 h-3" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-1">{Math.round(scale * 100)}%</span>
                </div>
            </div>

            {/* Selected PR detail panel */}
            <AnimatePresence>
                {selectedPR && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 overflow-hidden border-t border-border/20"
                    >
                        <div className="px-6 py-4 bg-secondary/10">
                            <div className="max-w-4xl mx-auto flex items-start gap-4">
                                {selectedPR.authorAvatar && (
                                    <img
                                        src={selectedPR.authorAvatar}
                                        alt={selectedPR.authorLogin}
                                        className="w-10 h-10 rounded-full ring-2 ring-border/20 shrink-0"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold truncate">{selectedPR.title}</span>
                                        <Badge variant="outline" className="text-[9px] shrink-0">
                                            #{selectedPR.number}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {selectedPR.authorLogin}
                                        </span>
                                        <span>→</span>
                                        <span className="flex items-center gap-1">
                                            <GitBranch className="w-3 h-3" />
                                            <code className="text-[10px] px-1 py-0.5 rounded bg-secondary/30">{selectedPR.headBranch}</code>
                                            → <code className="text-[10px] px-1 py-0.5 rounded bg-secondary/30">{selectedPR.baseBranch}</code>
                                        </span>
                                        <span>•</span>
                                        <span>{new Date(selectedPR.mergedAt).toLocaleDateString()}</span>
                                        {selectedPR.mergedByLogin && (
                                            <>
                                                <span>•</span>
                                                <span>merged by {selectedPR.mergedByLogin}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <a
                                    href={selectedPR.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    View on GitHub
                                </a>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Load more bar */}
            {hasMore && (
                <div className="shrink-0 border-t border-border/20 bg-[#0a0e1a]/95 backdrop-blur-xl px-6 py-2.5">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            <GitPullRequest className="w-3 h-3 inline mr-1" />
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
