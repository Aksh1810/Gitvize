"use client";

import { useMemo, useState } from "react";
import { GitCommit, GitMerge, GitBranch, ChevronDown } from "lucide-react";
import type { Branch, Commit } from "@/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommitHistoryRailProps {
    commits: Commit[];
    defaultBranch: string;
    branches?: Branch[]; // optional: used to label lanes from branch HEAD SHAs
    /** When provided, overrides the internal branch selector and hides the dropdown */
    selectedBranchOverride?: string | null;
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface RailItem {
    commit: Commit;
    laneIndex: number;
    colorIndex: number;
    isMerge: boolean;
}

// An edge from a child commit (newer, lower row) to a parent (older, higher row)
interface DagEdge {
    fromRow: number;
    fromLane: number;
    colorIndex: number;
    toRow: number;
    toLane: number;
    isMergeEdge: boolean;
}

// Active lane state during assignment
interface LaneState {
    /** Full SHA this lane is currently tracking (expecting to see next) */
    waitingFor: string | null;
    /** Branch name label, if known */
    label?: string;
    /** Stable color index — assigned once when the lane opens, never changes on reuse */
    colorIndex: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAIN_COLOR = "#ef4444"; // red — reserved exclusively for main/default branch

// Colors for all non-main branches (colorIndex 1, 2, 3, …)
const BRANCH_COLORS = [
    "#22d3ee", // cyan
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
    "#84cc16", // lime
    "#e879f9", // fuchsia
];

function laneColor(colorIndex: number): string {
    if (colorIndex === 0) return MAIN_COLOR;
    return BRANCH_COLORS[(colorIndex - 1) % BRANCH_COLORS.length];
}

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
    selectedBranchOverride,
}: CommitHistoryRailProps) {
    const [internalBranch, setInternalBranch] = useState<string | null>(null);
    const [showAllLegend, setShowAllLegend] = useState(false);
    const selectedBranch = selectedBranchOverride !== undefined ? selectedBranchOverride : internalBranch;

    // Build a SHA→commit map for fast parent traversal
    const commitMap = useMemo(() => {
        const m = new Map<string, Commit>();
        commits.forEach((c) => m.set(c.sha, c));
        return m;
    }, [commits]);

    // When a branch is selected, compute the set of SHAs reachable from its HEAD
    const reachableShas = useMemo(() => {
        if (!selectedBranch) return null;
        const branch = branches?.find((b) => b.name === selectedBranch);
        if (!branch) return null;
        const visited = new Set<string>();
        const queue = [branch.sha];
        while (queue.length > 0) {
            const sha = queue.shift()!;
            if (visited.has(sha)) continue;
            visited.add(sha);
            const commit = commitMap.get(sha);
            commit?.parents?.forEach((p) => { if (!visited.has(p)) queue.push(p); });
        }
        return visited;
    }, [selectedBranch, branches, commitMap]);

    // ── Step 1: Sort and limit commits ────────────────────────────────────────
    const { sortedCommits, clipped } = useMemo(() => {
        const filtered = reachableShas
            ? commits.filter((c) => reachableShas.has(c.sha))
            : commits;
        const sorted = [...filtered].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        return {
            sortedCommits: sorted.slice(0, 500),
            clipped: sorted.length > 500,
        };
    }, [commits]);

    // ── Step 2: Build branch HEAD lookups ────────────────────────────────────
    // branchHeadToName: sha → first branch name (used during lane label assignment)
    // branchHeadToNames: sha → all branch names (used for per-commit annotations)
    const branchHeadToName = useMemo(() => {
        const map = new Map<string, string>();
        (branches ?? []).forEach((b) => { if (!map.has(b.sha)) map.set(b.sha, b.name); });
        return map;
    }, [branches]);

    const branchHeadToNames = useMemo(() => {
        const map = new Map<string, string[]>();
        (branches ?? []).forEach((b) => {
            const existing = map.get(b.sha);
            if (existing) existing.push(b.name);
            else map.set(b.sha, [b.name]);
        });
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
    const { railItems, activeLanes, branchNameToColorIndex } = useMemo(() => {
        const lanes: LaneState[] = [];
        let nextColor = 0;
        // Record branch name → colorIndex at the exact moment each branch tip is seen.
        // This is the only reliable source — activeLanes reflect final state which may
        // differ due to slot reuse.
        const nameToCI = new Map<string, number>();

        const defaultBranchHead = branches?.find((b) => b.isDefault)?.sha;
        if (defaultBranchHead && sortedCommits.some((c) => c.sha === defaultBranchHead)) {
            const ci = nextColor++;
            lanes.push({ waitingFor: defaultBranchHead, label: defaultBranch, colorIndex: ci });
            nameToCI.set(defaultBranch, ci);
        }

        const items: RailItem[] = sortedCommits.map((commit) => {
            const parents = commit.parents ?? [];
            const isMerge = parents.length >= 2;

            const matchingIdxs: number[] = [];
            lanes.forEach((lane, i) => {
                if (lane.waitingFor === commit.sha) matchingIdxs.push(i);
            });

            let myLane: number;

            if (matchingIdxs.length === 0) {
                const emptySlot = lanes.findIndex((l) => l.waitingFor === null);
                if (emptySlot !== -1 && lanes.length >= MAX_LANES) {
                    myLane = emptySlot;
                    const ci = nextColor++;
                    lanes[emptySlot].waitingFor = parents[0] ?? null;
                    lanes[emptySlot].colorIndex = ci;
                    const label = branchHeadToName.get(commit.sha);
                    if (label) { lanes[emptySlot].label = label; nameToCI.set(label, ci); }
                } else if (lanes.length < MAX_LANES) {
                    myLane = lanes.length;
                    const ci = nextColor++;
                    const label = branchHeadToName.get(commit.sha) ??
                        (myLane === 0 ? defaultBranch : undefined);
                    lanes.push({ waitingFor: parents[0] ?? null, label, colorIndex: ci });
                    if (label) nameToCI.set(label, ci);
                } else {
                    const fallback = lanes.findIndex((l) => l.waitingFor === null);
                    myLane = fallback !== -1 ? fallback : 0;
                    if (fallback !== -1) lanes[fallback].waitingFor = parents[0] ?? null;
                }
            } else {
                myLane = matchingIdxs[0];
                lanes[myLane].waitingFor = parents[0] ?? null;
                if (!lanes[myLane].label && branchHeadToName.has(commit.sha)) {
                    const label = branchHeadToName.get(commit.sha)!;
                    lanes[myLane].label = label;
                    nameToCI.set(label, lanes[myLane].colorIndex);
                }
                for (let k = 1; k < matchingIdxs.length; k++) {
                    lanes[matchingIdxs[k]].waitingFor = null;
                }
            }

            if (isMerge && parents[1]) {
                const secondParent = parents[1];
                const alreadyTracked = lanes.some((l) => l.waitingFor === secondParent);
                if (!alreadyTracked) {
                    const emptySlot = lanes.findIndex((l) => l.waitingFor === null);
                    if (emptySlot !== -1) {
                        const ci = nextColor++;
                        lanes[emptySlot].waitingFor = secondParent;
                        lanes[emptySlot].colorIndex = ci;
                        lanes[emptySlot].label = undefined;
                    } else if (lanes.length < MAX_LANES) {
                        lanes.push({ waitingFor: secondParent, colorIndex: nextColor++ });
                    }
                }
            }

            const clampedLane = Math.min(myLane, MAX_LANES - 1);
            return { commit, laneIndex: clampedLane, colorIndex: lanes[clampedLane].colorIndex, isMerge };
        });

        return { railItems: items, activeLanes: [...lanes], branchNameToColorIndex: nameToCI };
    }, [sortedCommits, branchHeadToName, defaultBranch, branches]);

    // branchNameToColor — uses colorIndices recorded during lane assignment, so
    // chips and legend always match lane line colors exactly.
    const branchNameToColor = useMemo(() => {
        const map = new Map<string, string>();
        const maxUsed = branchNameToColorIndex.size > 0
            ? Math.max(...branchNameToColorIndex.values())
            : -1;
        let nextIdx = maxUsed + 1;
        (branches ?? []).forEach((b) => {
            const ci = branchNameToColorIndex.get(b.name);
            map.set(b.name, laneColor(ci !== undefined ? ci : nextIdx++));
        });
        return map;
    }, [branchNameToColorIndex, branches]);

    // ── Step 4: Compute DAG edges from parent relationships ────────────────────
    //
    // For each commit, for each parent that exists in our window:
    //   → draw an edge from this commit's dot to the parent's dot
    //   → same lane = straight vertical; different lane = bezier curve
    const edges = useMemo(() => {
        const shaToRow = new Map<string, number>();
        const shaToLane = new Map<string, number>();
        const shaToColor = new Map<string, number>();
        railItems.forEach((item, i) => {
            shaToRow.set(item.commit.sha, i);
            shaToLane.set(item.commit.sha, item.laneIndex);
            shaToColor.set(item.commit.sha, item.colorIndex);
        });

        const result: DagEdge[] = [];
        railItems.forEach((item, rowIdx) => {
            const parents = item.commit.parents ?? [];
            parents.forEach((parentSha, pIdx) => {
                const parentRow = shaToRow.get(parentSha);
                if (parentRow === undefined) return; // parent outside our window
                const parentLane = shaToLane.get(parentSha) ?? item.laneIndex;
                const parentColor = shaToColor.get(parentSha) ?? item.colorIndex;
                // Color by the branch lane: merge edges use the branch (child) color;
                // straight same-lane edges use the lane's own color.
                const colorIndex = pIdx > 0 ? item.colorIndex : parentColor;
                result.push({
                    fromRow: rowIdx,
                    fromLane: item.laneIndex,
                    colorIndex,
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
                    <GitMerge className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-foreground">
                        Commit History
                    </h3>
                </div>
                <div className="flex items-center gap-3">
                    {/* Internal dropdown — hidden when parent controls selection via override */}
                    {selectedBranchOverride === undefined && (
                        <div className="relative">
                            <select
                                value={internalBranch ?? ""}
                                onChange={(e) => setInternalBranch(e.target.value || null)}
                                className="appearance-none pl-3 pr-7 py-1 text-[11px] font-medium rounded-full border border-white/15 bg-white/5 text-slate-300 cursor-pointer focus:outline-none hover:bg-white/10 transition-colors"
                            >
                                <option value="">All branches</option>
                                {(branches ?? []).map((b) => (
                                    <option key={b.name} value={b.name}>{b.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                        {railItems.length} commits · {laneCount}{laneCount < activeLanes.length ? "+" : ""} lanes
                    </div>
                </div>
            </div>

            {/* Branch legend — hidden when parent (BranchGraph) owns the chip strip */}
            {selectedBranchOverride === undefined && (branches ?? []).length > 0 && (
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-semibold text-slate-300">Branches</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-400">{(branches ?? []).length}</span>
                        </div>
                        {(branches ?? []).length > 7 && (
                            <button
                                onClick={() => setShowAllLegend(!showAllLegend)}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                {showAllLegend ? "Show less" : `+${(branches ?? []).length - 7} more`}
                                <ChevronDown className={`w-3 h-3 transition-transform ${showAllLegend ? "rotate-180" : ""}`} />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(showAllLegend ? (branches ?? []) : (branches ?? []).slice(0, 7)).map((b) => {
                            const color = branchNameToColor.get(b.name) ?? "#64748b";
                            const isSelected = internalBranch === b.name;
                            return (
                                <button
                                    key={b.name}
                                    onClick={() => setInternalBranch(isSelected ? null : b.name)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                                    style={{
                                        border: b.isDefault ? `2px solid ${color}` : `1px solid ${color}40`,
                                        background: isSelected ? `${color}20` : `${color}10`,
                                        color,
                                    }}
                                >
                                    <GitBranch className="w-3 h-3" />
                                    <span className="max-w-[120px] truncate">{b.name}</span>
                                    {b.isDefault && (
                                        <span className="text-[9px] border border-current rounded px-1 opacity-70">default</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

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
                            {/* Small GitLab-style arrowheads — one per colorIndex (0 = main, 1…MAX_LANES = branches) */}
                            {Array.from({ length: MAX_LANES + 1 }, (_, i) => laneColor(i)).map((color, i) => (
                                <marker
                                    key={i}
                                    id={`arr-${i}`}
                                    viewBox="0 0 6 6"
                                    refX="6"
                                    refY="3"
                                    markerWidth="5"
                                    markerHeight="4"
                                    orient="auto"
                                >
                                    <path d="M 0 0 L 6 3 L 0 6 Z" fill={color} fillOpacity={0.7} />
                                </marker>
                            ))}
                        </defs>

                        {/* ── DAG edges ── */}
                        {edges.map((edge, i) => {
                            const childX  = laneXs[edge.fromLane] ?? laneXs[0];
                            const parentX = laneXs[edge.toLane]   ?? laneXs[0];
                            const childY  = edge.fromRow * ROW_HEIGHT + midY;
                            const parentY = edge.toRow   * ROW_HEIGHT + midY;

                            const colorIdx = edge.colorIndex;
                            const color = laneColor(colorIdx);
                            const isMain = edge.fromLane === 0 && edge.toLane === 0;

                            if (edge.fromLane === edge.toLane) {
                                // Same lane: clean vertical spine
                                return (
                                    <line
                                        key={`e${i}`}
                                        x1={childX}  y1={childY}
                                        x2={parentX} y2={parentY}
                                        stroke={color}
                                        strokeWidth={isMain ? 2 : 1.5}
                                        strokeOpacity={isMain ? 0.55 : 0.4}
                                        strokeLinecap="round"
                                    />
                                );
                            }

                            // Cross-lane: gentle S-curve with a small arrowhead at the child
                            // end (pointing into the merge commit or the first branch commit).
                            // Control points pulled toward their own endpoints so the curve
                            // eases naturally in/out of each dot instead of kinking at midpoint.
                            const gap = parentY - childY;
                            const d = `M ${parentX} ${parentY} C ${parentX} ${parentY - gap * 0.45}, ${childX} ${childY + gap * 0.45}, ${childX} ${childY}`;

                            return (
                                <path
                                    key={`e${i}`}
                                    d={d}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={edge.isMergeEdge ? 1.5 : 1}
                                    strokeOpacity={edge.isMergeEdge ? 0.6 : 0.3}
                                    strokeLinecap="round"
                                    markerEnd={`url(#arr-${colorIdx})`}
                                />
                            );
                        })}

                        {/* ── Commit dots (rendered above edges) ── */}
                        {railItems.map((item, i) => {
                            const cx = laneXs[item.laneIndex] ?? laneXs[0];
                            const cy = i * ROW_HEIGHT + midY;
                            const color = laneColor(item.colorIndex);

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
                                    <GitMerge className="w-3.5 h-3.5 text-slate-300 shrink-0" />
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
                                {branchHeadToNames.get(item.commit.sha)?.map((bName) => {
                                    const color = branchNameToColor.get(bName) ?? "#64748b";
                                    return (
                                        <span
                                            key={bName}
                                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                                            style={{
                                                border: `1px solid ${color}55`,
                                                color,
                                                background: `${color}18`,
                                            }}
                                        >
                                            <GitBranch className="w-2.5 h-2.5" />
                                            <span className="max-w-[100px] truncate">{bName}</span>
                                        </span>
                                    );
                                })}
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-slate-300 shrink-0 font-mono">
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
