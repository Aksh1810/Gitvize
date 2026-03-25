"use client";

import { useMemo } from "react";
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
    branchName?: string;
}

interface Segment {
    x: number;
    y1: number;
    y2: number;
    lane: number;
}

interface BranchStartEnd {
    type: "start" | "end";
    lane: number;
    x: number;
    y: number;
}

interface Connection {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    lane: number;
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
const LANE_SPACING = 24;
const LANE_START_X = 32;
const DOT_R = 5.5;
const MERGE_DOT_R = 7;

function laneFromCommit(commit: Commit): { key: string; isMerge: boolean; mergeSource?: string } {
    const msg = commit.message;
    const isMerge = /^merge\b/i.test(msg) || /merge pull request/i.test(msg);

    if (isMerge) {
        const mergeFrom = msg.match(/from\s+([^\s]+)/i)?.[1];
        return { key: "main", isMerge: true, mergeSource: mergeFrom?.toLowerCase() };
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
    // ── Lane assignment ──
    const { railItems, laneLabels, laneCount, clipped } = useMemo(() => {
        const sorted = [...commits].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const limited = sorted.slice(0, 500);

        const laneByKey = new Map<string, number>();
        laneByKey.set("main", 0);

        const labels = new Map<number, string>();
        labels.set(0, defaultBranch);

        let nextLane = 1;

        const items: RailItem[] = limited.map((commit) => {
            const lane = laneFromCommit(commit);
            let laneIndex = 0;
            let branchName: string | undefined;

            if (!lane.isMerge) {
                if (!laneByKey.has(lane.key)) {
                    laneByKey.set(lane.key, nextLane);
                    if (!labels.has(nextLane)) {
                        const cleanName = lane.key.replace(/^dependabot\//, "dep/");
                        labels.set(nextLane, cleanName);
                    }
                    nextLane += 1;
                    if (nextLane >= MAX_LANES) nextLane = 1;
                }
                laneIndex = laneByKey.get(lane.key) ?? 0;
                branchName = lane.key;
            }

            let mergeFromLane: number | undefined;
            if (lane.isMerge && lane.mergeSource) {
                if (!laneByKey.has(lane.mergeSource)) {
                    laneByKey.set(lane.mergeSource, nextLane);
                    if (!labels.has(nextLane)) {
                        const cleanName = lane.mergeSource.replace(/^dependabot\//, "dep/");
                        labels.set(nextLane, cleanName);
                    }
                    nextLane += 1;
                    if (nextLane >= MAX_LANES) nextLane = 1;
                }
                mergeFromLane = laneByKey.get(lane.mergeSource);
            }

            return { commit, laneIndex, isMerge: lane.isMerge, mergeFromLane, branchName };
        });

        // laneCount must cover the highest lane index actually used
        let maxLane = 1;
        items.forEach((item) => {
            maxLane = Math.max(maxLane, item.laneIndex);
            if (typeof item.mergeFromLane === "number")
                maxLane = Math.max(maxLane, item.mergeFromLane);
        });
        const usedCount = Math.min(MAX_LANES, maxLane + 1);

        return {
            railItems: items,
            laneLabels: labels,
            laneCount: usedCount,
            clipped: sorted.length > limited.length,
        };
    }, [commits, defaultBranch]);

    // ── X positions for each lane ──
    const laneXs = useMemo(
        () => Array.from({ length: laneCount }, (_, i) => LANE_START_X + i * LANE_SPACING),
        [laneCount]
    );

    const svgWidth = LANE_START_X + (laneCount - 1) * LANE_SPACING + LANE_START_X;
    const totalHeight = railItems.length * ROW_HEIGHT;
    const midY = ROW_HEIGHT / 2;

    // ── Compute graph geometry: segments, connections, dots ──
    const { segments, mergeConns, branchConns, branchEnds, dots } = useMemo(() => {
        // Group row indices by lane
        const byLane = new Map<number, number[]>();
        railItems.forEach((item, i) => {
            const arr = byLane.get(item.laneIndex) || [];
            arr.push(i);
            byLane.set(item.laneIndex, arr);
        });

        // Sort each lane's rows ascending
        byLane.forEach((rows) => rows.sort((a, b) => a - b));

        // Vertical segments: connect consecutive commits on the same lane
        const segs: Segment[] = [];
        byLane.forEach((rows, lane) => {
            const lx = laneXs[lane];
            if (lx === undefined) return;
            for (let i = 0; i < rows.length - 1; i++) {
                segs.push({
                    x: lx,
                    y1: rows[i] * ROW_HEIGHT + midY,
                    y2: rows[i + 1] * ROW_HEIGHT + midY,
                    lane,
                });
            }
        });

        // Branch start/end markers
        const bEnds: BranchStartEnd[] = [];
        byLane.forEach((rows, lane) => {
            if (lane === 0 || rows.length === 0) return;
            const lx = laneXs[lane];
            if (lx === undefined) return;

            // Branch start: at the oldest (highest index) commit on the branch
            const oldestRow = rows[rows.length - 1];
            bEnds.push({
                type: "start",
                lane,
                x: lx,
                y: oldestRow * ROW_HEIGHT + midY,
            });

            // Branch end: at the newest (lowest index) commit on the branch
            const newestRow = rows[0];
            bEnds.push({
                type: "end",
                lane,
                x: lx,
                y: newestRow * ROW_HEIGHT + midY,
            });
        });

        // Merge connections: branch → main (diagonal from nearest branch commit to merge commit)
        const merges: Connection[] = [];
        railItems.forEach((item, rowIndex) => {
            if (!item.isMerge || typeof item.mergeFromLane !== "number") return;
            const srcLane = item.mergeFromLane;
            const srcX = laneXs[srcLane];
            const dstX = laneXs[0];
            if (srcX === undefined || dstX === undefined) return;

            const srcRows = byLane.get(srcLane) || [];
            // Nearest source commit below (older than) the merge row
            const nearest = srcRows.find((r) => r > rowIndex);

            if (nearest !== undefined) {
                merges.push({
                    fromX: srcX,
                    fromY: nearest * ROW_HEIGHT + midY,
                    toX: dstX,
                    toY: rowIndex * ROW_HEIGHT + midY,
                    lane: srcLane,
                });
            } else {
                // No actual commits on source lane — short horizontal connector
                merges.push({
                    fromX: srcX,
                    fromY: rowIndex * ROW_HEIGHT + midY,
                    toX: dstX,
                    toY: rowIndex * ROW_HEIGHT + midY,
                    lane: srcLane,
                });
            }
        });

        // Branch divergence connections: main → branch (at oldest branch commit)
        const branches: Connection[] = [];
        byLane.forEach((rows, lane) => {
            if (lane === 0 || rows.length === 0) return;
            const lx = laneXs[lane];
            if (lx === undefined) return;

            const oldestRow = rows[rows.length - 1];
            const mainRows = byLane.get(0) || [];
            // Find nearest main commit at or after the oldest branch commit
            const mainAfter = mainRows.find((r) => r >= oldestRow);

            if (mainAfter !== undefined && mainAfter !== oldestRow) {
                branches.push({
                    fromX: laneXs[0],
                    fromY: mainAfter * ROW_HEIGHT + midY,
                    toX: lx,
                    toY: oldestRow * ROW_HEIGHT + midY,
                    lane,
                });
            }
        });

        // Commit dots
        const commitDots = railItems.map((item, i) => ({
            cx: laneXs[item.laneIndex] ?? laneXs[0],
            cy: i * ROW_HEIGHT + midY,
            lane: item.laneIndex,
            isMerge: item.isMerge,
        }));

        return {
            segments: segs,
            mergeConns: merges,
            branchConns: branches,
            branchEnds: bEnds,
            dots: commitDots,
        };
    }, [railItems, laneXs, midY]);

    return (
        <div className="glass-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-semibold text-foreground">
                            Commit History
                        </h3>
                    </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {railItems.length} commits · {laneCount} lanes
                </div>
            </div>

            {/* Lane legend */}
            <div className="flex flex-wrap gap-2 mb-3">
                {Array.from({ length: laneCount }, (_, laneIndex) => {
                    const color = LANE_COLORS[laneIndex % LANE_COLORS.length];
                    const laneLabel =
                        laneLabels.get(laneIndex) || `lane-${laneIndex + 1}`;
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
                            <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ background: color }}
                            />
                            <span className="max-w-[120px] truncate">
                                {laneLabel}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable graph + commit list */}
            <div className="max-h-[560px] overflow-auto custom-scrollbar rounded-xl border border-border/20 bg-[#070b15]/70">
                <div className="relative" style={{ minHeight: totalHeight }}>
                    {/* ── Single SVG canvas for all graph elements ── */}
                    <svg
                        className="absolute top-0 left-0 z-10 pointer-events-none"
                        width={svgWidth}
                        height={totalHeight}
                    >
                        <defs>
                            {/* Arrow markers per lane color */}
                            {LANE_COLORS.map((color, i) => (
                                <marker
                                    key={i}
                                    id={`rail-arrow-${i}`}
                                    viewBox="0 0 10 8"
                                    refX="9"
                                    refY="4"
                                    markerWidth="10"
                                    markerHeight="8"
                                    orient="auto"
                                >
                                    <path
                                        d="M 0 0 L 10 4 L 0 8 Z"
                                        fill={color}
                                        fillOpacity={0.9}
                                    />
                                </marker>
                            ))}{" "}
                        </defs>

                        {/* Vertical lane segments */}
                        {segments.map((seg, i) => (
                            <line
                                key={`s${i}`}
                                x1={seg.x}
                                y1={seg.y1}
                                x2={seg.x}
                                y2={seg.y2}
                                stroke={LANE_COLORS[seg.lane % LANE_COLORS.length]}
                                strokeWidth={2.5}
                                strokeOpacity={0.5}
                                strokeLinecap="round"
                            />
                        ))}

                        {/* Branch divergence curves (dashed) */}
                        {branchConns.map((c, i) => {
                            const color =
                                LANE_COLORS[c.lane % LANE_COLORS.length];
                            const cpY = (c.fromY + c.toY) / 2;
                            return (
                                <path
                                    key={`b${i}`}
                                    d={`M ${c.fromX} ${c.fromY} C ${c.fromX} ${cpY}, ${c.toX} ${cpY}, ${c.toX} ${c.toY}`}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeOpacity={0.5}
                                    strokeDasharray="6 4"
                                    strokeLinecap="round"
                                />
                            );
                        })}

                        {/* Merge connection curves (solid + arrow) */}
                        {mergeConns.map((c, i) => {
                            const color =
                                LANE_COLORS[c.lane % LANE_COLORS.length];
                            const cpY = (c.fromY + c.toY) / 2;
                            const isHorizontal =
                                Math.abs(c.fromY - c.toY) < 1;
                            const d = isHorizontal
                                ? `M ${c.fromX} ${c.fromY} L ${c.toX} ${c.toY}`
                                : `M ${c.fromX} ${c.fromY} C ${c.fromX} ${cpY}, ${c.toX} ${cpY}, ${c.toX} ${c.toY}`;
                            return (
                                <path
                                    key={`m${i}`}
                                    d={d}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2.5}
                                    strokeOpacity={0.85}
                                    strokeLinecap="round"
                                    markerEnd={`url(#rail-arrow-${c.lane % LANE_COLORS.length})`}
                                />
                            );
                        })}

                        {/* Branch start/end indicators */}
                        {branchEnds.map((be, i) => {
                            const color =
                                LANE_COLORS[be.lane % LANE_COLORS.length];
                            const size = be.type === "start" ? 7 : 5;
                            return be.type === "start" ? (
                                <circle
                                    key={`be${i}`}
                                    cx={be.x}
                                    cy={be.y}
                                    r={size}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2.5}
                                    strokeOpacity={0.6}
                                    strokeDasharray="3 2"
                                />
                            ) : null;
                        })}

                        {/* Commit dots (on top) */}
                        {dots.map((dot, i) => {
                            const color =
                                LANE_COLORS[dot.lane % LANE_COLORS.length];
                            return dot.isMerge ? (
                                <g key={`d${i}`}>
                                    {/* Merge dot: larger outer ring + inner dot */}
                                    <circle
                                        cx={dot.cx}
                                        cy={dot.cy}
                                        r={MERGE_DOT_R}
                                        fill="#0a0e1a"
                                        stroke={color}
                                        strokeWidth={2.5}
                                        strokeOpacity={0.95}
                                    />
                                    <circle
                                        cx={dot.cx}
                                        cy={dot.cy}
                                        r={2.5}
                                        fill={color}
                                        fillOpacity={0.9}
                                    />
                                </g>
                            ) : (
                                <circle
                                    key={`d${i}`}
                                    cx={dot.cx}
                                    cy={dot.cy}
                                    r={DOT_R}
                                    fill={color}
                                    stroke="#0a0e1a"
                                    strokeWidth={1.5}
                                    fillOpacity={0.9}
                                />
                            );
                        })}
                    </svg>

                    {/* ── Commit rows (text content) ── */}
                    {railItems.map((item) => (
                        <div
                            key={item.commit.sha}
                            className="flex border-b border-border/10 last:border-b-0"
                            style={{ height: ROW_HEIGHT }}
                        >
                            {/* Spacer aligned with SVG width */}
                            <div
                                style={{ width: svgWidth }}
                                className="shrink-0"
                            />

                            {/* Commit info */}
                            <div className="min-w-0 flex-1 flex items-center gap-2 px-3">
                                <span className="text-[10px] text-muted-foreground/70 w-[48px] shrink-0">
                                    {formatDateLabel(item.commit.date)}
                                </span>
                                {item.isMerge ? (
                                    <GitMerge className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                                ) : (
                                    <GitCommit className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                                )}
                                <p
                                    className="text-xs text-foreground/90 truncate flex-1"
                                    title={item.commit.message}
                                >
                                    {item.commit.message}
                                </p>
                                <span className="text-[10px] text-muted-foreground/70 max-w-[120px] truncate hidden sm:inline">
                                    {item.commit.authorName}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0">
                                    <GitBranch className="w-2.5 h-2.5" />
                                    {item.commit.sha.slice(0, 7)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {clipped && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                    Showing the latest 500 commits in this view for smooth
                    rendering.
                </p>
            )}
        </div>
    );
}
