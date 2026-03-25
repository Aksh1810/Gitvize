"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line } from "recharts";
import { Activity, Users, BarChart3 } from "lucide-react";
import type { Commit } from "@/types";

type RangeDays = 30 | 90 | 365;

interface CommitActivityChartProps {
    commits: Commit[];
}

interface ActivityPoint {
    dateKey: string;
    label: string;
    commits: number;
    activeAuthors: number;
}

function formatDayLabel(date: Date, range: RangeDays): string {
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: range === 365 ? undefined : "numeric",
    });
}

export default function CommitActivityChart({ commits }: CommitActivityChartProps) {
    const [range, setRange] = useState<RangeDays>(90);

    const activity = useMemo<ActivityPoint[]>(() => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - range + 1);

        const bucket = new Map<string, { commits: number; authors: Set<string> }>();

        for (let i = 0; i < range; i += 1) {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            const key = day.toISOString().slice(0, 10);
            bucket.set(key, { commits: 0, authors: new Set<string>() });
        }

        commits.forEach((commit) => {
            const commitDate = new Date(commit.date);
            const key = commitDate.toISOString().slice(0, 10);
            const entry = bucket.get(key);
            if (!entry) return;
            entry.commits += 1;
            entry.authors.add(commit.authorLogin || commit.authorName);
        });

        return Array.from(bucket.entries()).map(([dateKey, value]) => {
            const date = new Date(`${dateKey}T00:00:00`);
            return {
                dateKey,
                label: formatDayLabel(date, range),
                commits: value.commits,
                activeAuthors: value.authors.size,
            };
        });
    }, [commits, range]);

    const totals = useMemo(() => {
        let totalCommits = 0;
        let activeDayCount = 0;
        let peakCommits = 0;

        activity.forEach((point) => {
            totalCommits += point.commits;
            if (point.commits > 0) activeDayCount += 1;
            if (point.commits > peakCommits) peakCommits = point.commits;
        });

        return { totalCommits, activeDayCount, peakCommits };
    }, [activity]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-semibold text-foreground">Commit Activity Over Time</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Daily commit volume and active contributors.
                    </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-secondary/30 p-0.5">
                    {([30, 90, 365] as RangeDays[]).map((option) => (
                        <button
                            key={option}
                            onClick={() => setRange(option)}
                            className={`px-2 py-1 rounded-md text-[11px] transition-colors ${range === option
                                ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                                : "text-muted-foreground hover:text-foreground border border-transparent"
                                }`}
                        >
                            {option}d
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg border border-border/20 bg-secondary/20 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Commits</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{totals.totalCommits}</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-secondary/20 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Active Days
                    </p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{totals.activeDayCount}</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-secondary/20 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> Peak / Day
                    </p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{totals.peakCommits}</p>
                </div>
            </div>

            <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={activity} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "rgba(148,163,184,0.8)" }}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                            interval={range === 365 ? 20 : 6}
                        />
                        <YAxis
                            yAxisId="left"
                            allowDecimals={false}
                            tick={{ fontSize: 10, fill: "rgba(148,163,184,0.8)" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            allowDecimals={false}
                            tick={{ fontSize: 10, fill: "rgba(148,163,184,0.8)" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                background: "rgba(8, 12, 22, 0.92)",
                                border: "1px solid rgba(99,102,241,0.25)",
                                borderRadius: "10px",
                                fontSize: "12px",
                            }}
                            labelStyle={{ color: "#e2e8f0" }}
                        />
                        <Bar
                            yAxisId="left"
                            dataKey="commits"
                            fill="rgba(99,102,241,0.7)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={16}
                            name="Commits"
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="activeAuthors"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: "#22d3ee" }}
                            name="Active Authors"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}
