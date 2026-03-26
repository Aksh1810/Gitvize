"use client";

import { useMemo } from "react";
import { GitCommit, GitMerge, GitBranch } from "lucide-react";
import type { Branch, Commit } from "@/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommitHistoryRailProps {
    commits: Commit[];
    defaultBranch: string;
    branches?: Branch[]; // optional: used to label lanes from branch HEAD SHAs
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface RailItem {
    commit: Commit;
    laneIndex: number;
    isMerge: boolean;
}

// An edge from a child commit (newer, lower row) to a parent (older, higher row)
interface DagEdge {
    fromRow: number;
    fromLane: number;
    toRow: number;
    toLane: number;
    /** true when this edge leads to the 2nd+ parent of a merge commit */
    isMergeEdge: boolean;
}

// Active lane state during assignment
interface LaneState {
    /** Full SHA this lane is currently tracking (expecting to see next) */
    waitingFor: string | null;
    /** Branch name label, if known */
    label?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LANE_COLORS = [
    "#ef4444", // red    – main/default branch
    "#22d3ee", // cyan
    "#a855f7", // purple
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ec4899", // pink
    "#3b82f6", // blue
    "#84cc16", // lime
];

const MAX_LANES = 8;
const ROW_HEIGHT = 44;
const LANE_SPACING = 24;
const LANE_START_X = 32;
const DOT_R = 5.5;
const MERGE_DOT_R = 7;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommitHistoryRail({
    commits,
    defaultBranch,
    branches,
}: CommitHistoryRailProps) {
    // ── Step 1: Sort and limit commits ────────────────────────────────────────
    const { sortedCommits, clipped } = useMemo(() => {
        const sorted = [...commits].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        return {
            sortedCommits: sorted.slice(0, 500),
            clipped: sorted.length > 500,
        };
    }, [commits]);

    // ── Step 2: Build branch HEAD lookup (full SHA → branch name) ─────────────
    // This lets us label lanes when a branch tip appears in the commit list.
    const branchHeadToName = useMemo(() => {
        const map = new Map<string, string>();
        (branches ?? []).forEach((b) => map.set(b.sha, b.name));
        return map;
    }, [branches]);

    // ── Step 3: DAG lane assignment ───────────────────────────────────────────
    //
    // Algorithm (processes commits newest → oldest, which is top → bottom):
    //
    // We maintain a list of "active lanes". Each lane has a `waitingFor` field —
    // the full SHA of the next commit it expects to see (its next ancestor).
    //
    // For each commit C:
    //   a) Find all lanes where waitingFor === C.sha
    //   b) If none found → C is a branch tip; open a new lane (or reuse empty slot)
    //   c) If found → assign C to the first matching lane; update waitingFor to
    //      C.parents[0]; close extra matching lanes (they converged here)
    //   d) If C is a merge commit (2+ parents) → ensure C.parents[1] is tracked
    //      by some lane (open or reuse)
    //
    // This is the same algorithm used by `git log --graph`.
    const { railItems, activeLanes } = useMemo(() => {
        const lanes: LaneState[] = [];

        const items: RailItem[] = sortedCommits.map((commit) => {
            const parents = commit.parents ?? [];
            const isMerge = parents.length >= 2;

            // Find all lanes currently expecting this commit
            const matchingIdxs: number[] = [];
            lanes.forEach((lane, i) => {
                if (lane.waitingFor === commit.sha) matchingIdxs.push(i);
            });

            let myLane: number;

            if (matchingIdxs.length === 0) {
                // No lane expected this commit → it's a new branch tip
                // Try to reuse an empty (closed) lane slot first to keep layout compact
                const emptySlot = lanes.findIndex((l) => l.waitingFor === null);
                if (emptySlot !== -1 && lanes.length >= MAX_LANES) {
                    myLane = emptySlot;
                    lanes[emptySlot].waitingFor = parents[0] ?? null;
                    if (!lanes[emptySlot].label && branchHeadToName.has(commit.sha)) {
                        lanes[emptySlot].label = branchHeadToName.get(commit.sha);
                    }
                } else if (lanes.length < MAX_LANES) {
                    myLane = lanes.length;
                    lanes.push({
                        waitingFor: parents[0] ?? null,
                        label: branchHeadToName.get(commit.sha) ??
                            (myLane === 0 ? defaultBranch : undefined),
                    });
                } else {
                    // At max lanes and no empty slot — collapse to an existing lane
                    const fallback = lanes.findIndex((l) => l.waitingFor === null);
                    myLane = fallback !== -1 ? fallback : 0;
                    if (fallback !== -1) lanes[fallback].waitingFor = parents[0] ?? null;
                }
            } else {
                // Assign to the first matching lane
                myLane = matchingIdxs[0];
                lanes[myLane].waitingFor = parents[0] ?? null;

                // Apply branch label if we now know it
                if (!lanes[myLane].label && branchHeadToName.has(commit.sha)) {
                    lanes[myLane].label = branchHeadToName.get(commit.sha);
                }

                // Close extra matching lanes (multiple branches converged here)
                for (let k = 1; k < matchingIdxs.length; k++) {
                    lanes[matchingIdxs[k]].waitingFor = null;
                }
            }

            // Merge commit: ensure the second parent is tracked by a lane
            if (isMerge && parents[1]) {
                const secondParent = parents[1];
                const alreadyTracked = lanes.some(
                    (l) => l.waitingFor === secondParent
                );
                if (!alreadyTracked) {
                    const emptySlot = lanes.findIndex((l) => l.waitingFor === null);
                    if (emptySlot !== -1) {
                        lanes[emptySlot].waitingFor = secondParent;
                    } else if (lanes.length < MAX_LANES) {
                        lanes.push({ waitingFor: secondParent });
                    }
                }
            }

            return {
                commit,
                laneIndex: Math.min(myLane, MAX_LANES - 1),
                isMerge,
            };
        });

        return { railItems: items, activeLanes: [...lanes] };
    }, [sortedCommits, branchHeadToName, defaultBranch]);

    // ── Step 4: Compute DAG edges from parent relationships ────────────────────
    //
    // For each commit, for each parent that exists in our window:
    //   → draw an edge from this commit's dot to the parent's dot
    //   → same lane = straight vertical; different lane = bezier curve
    const edges = useMemo(() => {
        const shaToRow = new Map<string, number>();
        const shaToLane = new Map<string, number>();
        railItems.forEach((item, i) => {
            shaToRow.set(item.commit.sha, i);
            shaToLane.set(item.commit.sha, item.laneIndex);
        });

        const result: DagEdge[] = [];
        railItems.forEach((item, rowIdx) => {
            const parents = item.commit.parents ?? [];
            parents.forEach((parentSha, pIdx) => {
                const parentRow = shaToRow.get(parentSha);
                if (parentRow === undefined) return; // parent outside our window
                const parentLane = shaToLane.get(parentSha) ?? item.laneIndex;
                result.push({
                    fromRow: rowIdx,
                    fromLane: item.laneIndex,
                    toRow: parentRow,
                    toLane: parentLane,
                    isMergeEdge: pIdx > 0,
                });
            });
        });

        return result;
    }, [railItems]);

    // ── Step 5: Geometry ───────────────────────────────────────────────────────
    const laneCount = Math.max(
        1,
        Math.min(MAX_LANES, activeLanes.length)
    );
    const laneXs = useMemo(
        () => Array.from({ length: laneCount }, (_, i) => LANE_START_X + i * LANE_SPACING),
        [laneCount]
    );
    const svgWidth = LANE_START_X + (laneCount - 1) * LANE_SPACING + LANE_START_X;
    const totalHeight = railItems.length * ROW_HEIGHT;
    const midY = ROW_HEIGHT / 2;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="glass-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <GitMerge className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-foreground">
                        Commit History
                    </h3>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {railItems.length} commits · {laneCount}{laneCount < activeLanes.length ? "+" : ""} lanes
                </div>
            </div>

            {/* Lane legend */}
            <div className="flex flex-wrap gap-2 mb-3">
                {activeLanes.slice(0, MAX_LANES).map((lane, laneIndex) => {
                    const color = LANE_COLORS[laneIndex % LANE_COLORS.length];
                    const label = lane.label ?? (laneIndex === 0 ? defaultBranch : `branch-${laneIndex + 1}`);
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
                            <span className="max-w-[120px] truncate">{label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable graph + commit list */}
            <div className="max-h-[560px] overflow-auto custom-scrollbar rounded-xl border border-border/20 bg-[#070b15]/70">
                <div className="relative" style={{ minHeight: totalHeight }}>

                    {/* ── Single SVG canvas spanning the full commit list ── */}
                    <svg
                        className="absolute top-0 left-0 z-10 pointer-events-none"
                        width={svgWidth}
                        height={totalHeight}
                    >
                        <defs>
                            {/* Arrow markers, one per lane color */}
                            {LANE_COLORS.map((color, i) => (
                                <marker
                                    key={i}
                                    id={`rail-arr-${i}`}
                                    viewBox="0 0 10 8"
                                    refX="9"
                                    refY="4"
                                    markerWidth="9"
                                    markerHeight="8"
                                    orient="auto"
                                >
                                    <path d="M 0 0 L 10 4 L 0 8 Z" fill={color} fillOpacity={0.9} />
                                </marker>
                            ))}
                        </defs>

                        {/* ── DAG edges ── */}
                        {edges.map((edge, i) => {
                            const fromX = laneXs[edge.fromLane] ?? laneXs[0];
                            const toX   = laneXs[edge.toLane]   ?? laneXs[0];
                            const fromY = edge.fromRow * ROW_HEIGHT + midY;
                            const toY   = edge.toRow   * ROW_HEIGHT + midY;

                            // Color by the destination lane (parent lane = branch color)
                            const colorIdx = edge.toLane % LANE_COLORS.length;
                            const color = LANE_COLORS[colorIdx];

                            if (edge.fromLane === edge.toLane) {
                                // ── Same lane: straight vertical line ──
                                return (
                                    <line
                                        key={`e${i}`}
                                        x1={fromX} y1={fromY}
                                        x2={toX}   y2={toY}
                                        stroke={color}
                                        strokeWidth={2.5}
                                        strokeOpacity={0.5}
                                        strokeLinecap="round"
                                    />
                                );
                            }

                            // ── Cross-lane: bezier curve (GitLab-style "hockey stick") ──
                            // The curve exits vertically from fromX, then sweeps to toX
                            const cpY = (fromY + toY) / 2;
                            const d = `M ${fromX} ${fromY} C ${fromX} ${cpY}, ${toX} ${cpY}, ${toX} ${toY}`;

                            if (edge.isMergeEdge) {
                                // Merge edge (branch → main): solid, with arrow at destination
                                return (
                                    <path
                                        key={`e${i}`}
                                        d={d}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={2.5}
                                        strokeOpacity={0.85}
                                        strokeLinecap="round"
                                        markerEnd={`url(#rail-arr-${colorIdx})`}
                                    />
                                );
                            }

                            // Diverge edge (main → branch): dashed, no arrow
                            return (
                                <path
                                    key={`e${i}`}
                                    d={d}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeOpacity={0.55}
                                    strokeDasharray="6 4"
                                    strokeLinecap="round"
                                />
                            );
                        })}

                        {/* ── Commit dots (rendered above edges) ── */}
                        {railItems.map((item, i) => {
                            const cx = laneXs[item.laneIndex] ?? laneXs[0];
                            const cy = i * ROW_HEIGHT + midY;
                            const color = LANE_COLORS[item.laneIndex % LANE_COLORS.length];

                            return item.isMerge ? (
                                // Merge commit: bullseye ring
                                <g key={`dot${i}`}>
                                    <circle
                                        cx={cx} cy={cy}
                                        r={MERGE_DOT_R}
                                        fill="#0a0e1a"
                                        stroke={color}
                                        strokeWidth={2.5}
                                        strokeOpacity={0.95}
                                    />
                                    <circle cx={cx} cy={cy} r={2.5} fill={color} fillOpacity={0.9} />
                                </g>
                            ) : (
                                // Regular commit: filled circle
                                <circle
                                    key={`dot${i}`}
                                    cx={cx} cy={cy}
                                    r={DOT_R}
                                    fill={color}
                                    stroke="#0a0e1a"
                                    strokeWidth={1.5}
                                    fillOpacity={0.9}
                                />
                            );
                        })}
                    </svg>

                    {/* ── Commit text rows ── */}
                    {railItems.map((item) => (
                        <div
                            key={item.commit.sha}
                            className="flex border-b border-border/10 last:border-b-0"
                            style={{ height: ROW_HEIGHT }}
                        >
                            {/* Spacer that matches the SVG lane column width */}
                            <div style={{ width: svgWidth }} className="shrink-0" />

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
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0 font-mono">
                                    <GitBranch className="w-2.5 h-2.5" />
                                    {item.commit.shortSha}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {clipped && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                    Showing the latest 500 commits. Use &quot;Load all&quot; in Timeline view for the full history.
                </p>
            )}
        </div>
    );
}
