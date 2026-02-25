"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Commit } from "@/types";

interface CommitHeatmapProps {
    commits: Commit[];
}

export default function CommitHeatmap({ commits }: CommitHeatmapProps) {
    const weeks = useMemo(() => {
        // Build 52-week heatmap
        const now = new Date();
        const weekData: number[] = new Array(52).fill(0);

        commits.forEach((c) => {
            const commitDate = new Date(c.date);
            const diffMs = now.getTime() - commitDate.getTime();
            const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
            if (diffWeeks >= 0 && diffWeeks < 52) {
                weekData[51 - diffWeeks]++;
            }
        });

        return weekData;
    }, [commits]);

    const maxCommits = Math.max(...weeks, 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
        >
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                Commit Activity (52 weeks)
            </h3>
            <div className="flex gap-[3px] overflow-x-auto pb-2">
                {weeks.map((count, i) => {
                    const intensity = count / maxCommits;
                    return (
                        <div
                            key={i}
                            className="flex flex-col gap-[3px]"
                        >
                            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                <div
                                    key={day}
                                    className="rounded-[2px] transition-colors"
                                    style={{
                                        width: "10px",
                                        height: "10px",
                                        background:
                                            day === 0 && count > 0
                                                ? `rgba(99, 102, 241, ${Math.max(0.15, intensity)})`
                                                : day <= Math.ceil(intensity * 6)
                                                    ? `rgba(99, 102, 241, ${Math.max(0.1, intensity * 0.8)})`
                                                    : "rgba(99, 102, 241, 0.05)",
                                    }}
                                    title={`Week ${i + 1}: ${count} commit${count !== 1 ? "s" : ""}`}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-end gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground/50">Less</span>
                {[0.05, 0.2, 0.4, 0.6, 0.8].map((level) => (
                    <div
                        key={level}
                        className="w-[10px] h-[10px] rounded-[2px]"
                        style={{ background: `rgba(99, 102, 241, ${level})` }}
                    />
                ))}
                <span className="text-[10px] text-muted-foreground/50">More</span>
            </div>
        </motion.div>
    );
}
