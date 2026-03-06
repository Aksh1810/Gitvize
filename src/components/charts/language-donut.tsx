"use client";

import { motion } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { LanguageStats } from "@/types";
import { getLanguageColor } from "@/lib/file-icons";

interface LanguageDonutProps {
    languages: LanguageStats;
}

export default function LanguageDonut({ languages }: LanguageDonutProps) {
    const total = Object.values(languages).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    const data = Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({
            name,
            value,
            percentage: ((value / total) * 100).toFixed(1),
            color: getLanguageColor(name),
        }));

    // Give every language a minimum visible slice in the chart (3%)
    const minShare = 3;
    const chartData = data.map((d) => {
        const realPct = (d.value / total) * 100;
        return {
            ...d,
            chartValue: Math.max(realPct, minShare),
        };
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
        >
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                Languages
            </h3>
            <div className="flex items-center gap-4">
                <div className="w-[120px] h-[120px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={30}
                                outerRadius={55}
                                paddingAngle={4}
                                dataKey="chartValue"
                                animationBegin={0}
                                animationDuration={800}
                                stroke="#0a0e1a"
                                strokeWidth={2}
                            >
                                {chartData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                content={({ payload }) => {
                                    if (!payload?.length) return null;
                                    const d = payload[0].payload;
                                    return (
                                        <div className="glass-card px-3 py-2 text-xs">
                                            <span className="font-medium">{d.name}</span>{" "}
                                            <span className="text-muted-foreground">
                                                {d.percentage}%
                                            </span>
                                        </div>
                                    );
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {data.map((lang) => (
                        <div key={lang.name} className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: lang.color }}
                            />
                            <span className="text-xs text-foreground truncate flex-1">
                                {lang.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {lang.percentage}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
