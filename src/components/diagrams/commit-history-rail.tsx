"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { GitCommit, GitMerge, GitBranch } from "lucide-react";
import type { Commit } from "@/types";

interface CommitHistoryRailProps {
    commits: Commit[];
    defaultBranch: string;
}

interface RailItem {
    commit: Commit;
    laneIndex: number;
    isMerge: boolean;
    mergeFromLane?: number;
}

const LANE_COLORS = [
    "#ef4444",
    "#22d3ee",
    "#a855f7",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#3b82f6",
    "#84cc16",
];

const MAX_LANES = 8;
const ROW_HEIGHT = 44;

function laneFromCommit(commit: Commit): { key: string; isMerge: boolean; mergeSource?: string } {
    const msg = commit.message;
    const mergeFrom = msg.match(/from\s+([^\s]+)/i)?.[1];
    const isMerge = /^merge\b/i.test(msg) || /merge pull request/i.test(msg);

    if (isMerge && mergeFrom) {
        return { key: "main", isMerge: true, mergeSource: mergeFrom.toLowerCase() };
    }

    if (isMerge) {
        return { key: "main", isMerge: true };
    }

    const authorKey = (commit.authorLogin || commit.authorName || "unknown").toLowerCase();
    return { key: authorKey, isMerge: false };
}

function formatDateLabel(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

export default function CommitHistoryRail({ commits, defaultBranch }: CommitHistoryRailProps) {
    const { railItems, laneLabels, laneCount, clipped } = useMemo(() => {
        const sorted = [...commits].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        // Keep rendering bounded for very large histories to avoid UI jank.
        const limited = sorted.slice(0, 500);
        const laneByKey = new Map<string, number>();
        laneByKey.set("main", 0);

        const labels = new Map<number, string>();
        labels.set(0, defaultBranch);

        let nextLane = 1;

        const items: RailItem[] = limited.map((commit) => {
            const lane = laneFromCommit(commit);
            let laneIndex = 0;

            if (!lane.isMerge) {
                if (!laneByKey.has(lane.key)) {
                    laneByKey.set(lane.key, nextLane);
                    if (!labels.has(nextLane)) {
                        labels.set(nextLane, lane.key.replace(/^dependabot\//, "dep/"));
                    }
                    nextLane += 1;
                    if (nextLane >= MAX_LANES) nextLane = 1;
                }
                laneIndex = laneByKey.get(lane.key) ?? 0;
            }

            let mergeFromLane: number | undefined;
            if (lane.isMerge && lane.mergeSource) {
                if (!laneByKey.has(lane.mergeSource)) {
                    laneByKey.set(lane.mergeSource, nextLane);
                    if (!labels.has(nextLane)) {
                        labels.set(nextLane, lane.mergeSource.replace(/^dependabot\//, "dep/"));
                    }
                    nextLane += 1;
                    if (nextLane >= MAX_LANES) nextLane = 1;
                }
                mergeFromLane = laneByKey.get(lane.mergeSource);
            }

            return {
                commit,
                laneIndex,
                isMerge: lane.isMerge,
                mergeFromLane,
            };
        });

        const laneUsed = new Set(items.map((item) => item.laneIndex));
        const usedCount = Math.max(2, Math.min(MAX_LANES, laneUsed.size));

        return {
            railItems: items,
            laneLabels: labels,
            laneCount: usedCount,
            clipped: sorted.length > limited.length,
        };
    }, [commits, defaultBranch]);

    const laneXs = useMemo(
        () => Array.from({ length: laneCount }, (_, i) => 20 + i * 18),
        [laneCount]
    );

    return (
        <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-semibold text-foreground">Commit History Rail</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        GitLab-inspired lane view with merges flowing into <span className="text-indigo-300">{defaultBranch}</span>.
                    </p>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {railItems.length} commits · {laneCount} lanes
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                {Array.from({ length: laneCount }, (_, laneIndex) => {
                    const color = LANE_COLORS[laneIndex % LANE_COLORS.length];
                    const laneLabel = laneLabels.get(laneIndex) || `lane-${laneIndex + 1}`;
                    return (
                        <div
                            key={laneIndex}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]"
                            style={{
                                borderColor: `${color}55`,
                                color,
                                background: `${color}12`,
                            }}
                        >
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                            <span className="max-w-[120px] truncate">{laneLabel}</span>
                        </div>
                    );
                })}
            </div>

            <div className="max-h-[560px] overflow-auto custom-scrollbar rounded-xl border border-border/20 bg-[#070b15]/70">
                {railItems.map((item) => {
                    const laneColor = LANE_COLORS[item.laneIndex % LANE_COLORS.length];

                    return (
                        <motion.div
                            key={item.commit.sha}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            className="grid grid-cols-[170px_minmax(0,1fr)] border-b border-border/10 last:border-b-0"
                            style={{ minHeight: `${ROW_HEIGHT}px` }}
                        >
                            <div className="relative">
                                <svg width="170" height={ROW_HEIGHT}>
                                    {laneXs.map((x, laneIdx) => (
                                        <line
                                            key={laneIdx}
                                            x1={x}
                                            y1={0}
                                            x2={x}
                                            y2={ROW_HEIGHT}
                                            stroke={LANE_COLORS[laneIdx % LANE_COLORS.length]}
                                            strokeOpacity={laneIdx === item.laneIndex ? 0.5 : 0.2}
                                            strokeWidth={laneIdx === item.laneIndex ? 2.1 : 1.4}
                                        />
                                    ))}

                                    {item.isMerge && typeof item.mergeFromLane === "number" && item.mergeFromLane !== 0 && (
                                        <path
                                            d={`M ${laneXs[item.mergeFromLane]} 10 C ${laneXs[item.mergeFromLane]} 10, ${laneXs[0]} 16, ${laneXs[0]} 22`}
                                            fill="none"
                                            stroke={LANE_COLORS[item.mergeFromLane % LANE_COLORS.length]}
                                            strokeWidth={1.8}
                                            strokeOpacity={0.8}
                                            strokeLinecap="round"
                                        />
                                    )}

                                    <circle
                                        cx={laneXs[item.laneIndex]}
                                        cy={22}
                                        r={item.isMerge ? 4.8 : 4.2}
                                        fill={item.isMerge ? "#0a0e1a" : laneColor}
                                        stroke={laneColor}
                                        strokeWidth={2}
                                    />
                                </svg>
                            </div>

                            <div className="min-w-0 px-2 py-2 flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground/70 w-[48px] shrink-0">
                                    {formatDateLabel(item.commit.date)}
                                </span>
                                {item.isMerge ? (
                                    <GitMerge className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                                ) : (
                                    <GitCommit className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                                )}
                                <p className="text-xs text-foreground/90 truncate flex-1" title={item.commit.message}>
                                    {item.commit.message}
                                </p>
                                <span className="text-[10px] text-muted-foreground/70 max-w-[120px] truncate hidden sm:inline">
                                    {item.commit.authorName}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0">
                                    <GitBranch className="w-2.5 h-2.5" />
                                    {item.commit.sha}
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {clipped && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                    Showing the latest 500 commits in this view for smooth rendering.
                </p>
            )}
        </div>
    );
}
