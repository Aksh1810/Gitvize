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
    running: <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />,
    complete: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <XCircle className="w-4 h-4 text-red-400" />,
};

export default function PipelineStatusDisplay({ steps }: PipelineStatusProps) {
    const isActive = steps.some((s) => s.status === "running");

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pro-surface loading-shimmer-soft p-6 max-w-md mx-auto"
        >
            <div className="flex items-center gap-4 mb-6">
                <div
                    className={`relative w-11 h-11 rounded-2xl flex items-center justify-center ${
                        isActive ? "bg-white/12 status-pulse-subtle" : "bg-secondary/60"
                    }`}
                >
                    <div className="absolute -inset-2 rounded-2xl bg-white/10 blur" />
                    <Brain className={`w-5 h-5 relative ${isActive ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                    <h3 className="font-semibold text-base">AI Analysis Pipeline</h3>
                    <p className="text-xs text-muted-foreground">
                        {isActive ? "Processing live graph synthesis" : "Complete"}
                    </p>
                </div>
            </div>

            <div className="space-y-4 relative">
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-white/40 via-white/20 to-transparent" />
                {steps.map((s, i) => (
                    <motion.div
                        key={s.step}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-start gap-3 relative"
                    >
                        <div className="mt-0.5 z-10">{statusIcon[s.status]}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                {stepConfig[s.step].icon}
                                <span
                                    className={`text-sm font-medium ${s.status === "running"
                                            ? "text-white"
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
