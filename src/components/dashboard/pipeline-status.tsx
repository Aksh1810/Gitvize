"use client";

import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Brain, Download, Sparkles } from "lucide-react";
import type { PipelineStep, PipelineStatus } from "@/types";

interface PipelineStatusProps {
    steps: Array<{
        step: PipelineStep;
        status: PipelineStatus;
        message: string;
    }>;
}

const stepConfig: Record<
    PipelineStep,
    { label: string; icon: React.ReactNode }
> = {
    ingest: { label: "Ingesting", icon: <Download className="w-4 h-4" /> },
    understand: { label: "Analyzing", icon: <Brain className="w-4 h-4" /> },
    enrich: { label: "Enriching", icon: <Sparkles className="w-4 h-4" /> },
};

const statusIcon: Record<PipelineStatus, React.ReactNode> = {
    pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
    running: <Loader2 className="w-4 h-4 animate-spin text-indigo" />,
    complete: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <XCircle className="w-4 h-4 text-red-400" />,
};

export default function PipelineStatusDisplay({ steps }: PipelineStatusProps) {
    const isActive = steps.some((s) => s.status === "running");

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 max-w-md mx-auto"
        >
            <div className="flex items-center gap-3 mb-6">
                <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive
                            ? "bg-indigo/10 animate-pulse-glow"
                            : "bg-secondary/50"
                        }`}
                >
                    <Brain className={`w-5 h-5 ${isActive ? "text-indigo" : "text-muted-foreground"}`} />
                </div>
                <div>
                    <h3 className="font-semibold">AI Analysis Pipeline</h3>
                    <p className="text-xs text-muted-foreground">
                        {isActive ? "Processing..." : "Complete"}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {steps.map((s, i) => (
                    <motion.div
                        key={s.step}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-start gap-3"
                    >
                        <div className="mt-0.5">{statusIcon[s.status]}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                {stepConfig[s.step].icon}
                                <span
                                    className={`text-sm font-medium ${s.status === "running"
                                            ? "text-indigo"
                                            : s.status === "complete"
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                        }`}
                                >
                                    {stepConfig[s.step].label}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {s.message}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
