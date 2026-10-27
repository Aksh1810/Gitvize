"use client";

import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Circle, Brain, Download, Sparkles } from "lucide-react";
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
    ingest: { label: "Repository data", icon: <Download className="w-4 h-4" /> },
    understand: { label: "Analysis", icon: <Brain className="w-4 h-4" /> },
    enrich: { label: "Enrichment", icon: <Sparkles className="w-4 h-4" /> },
};

const statusIcon: Record<PipelineStatus, React.ReactNode> = {
    pending: <Circle className="w-4 h-4" />,
    running: <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />,
    complete: <CheckCircle2 className="w-4 h-4" />,
    error: <XCircle className="w-4 h-4" />,
};

const statusLabel: Record<PipelineStatus, string> = {
    pending: "Waiting", running: "In progress", complete: "Complete", error: "Failed",
};

export default function PipelineStatusDisplay({ steps }: PipelineStatusProps) {
    const isActive = steps.some((s) => s.status === "running");
    const summary = steps.some(s => s.status === "error") ? "Analysis needs attention"
        : isActive ? "Analysis in progress"
        : steps.length > 0 && steps.every(s => s.status === "complete") ? "Analysis complete"
        : "Waiting for analysis";

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="atlas-pipeline"
        >
            <div className="pipeline-heading">
                <h3>Repository analysis</h3>
                <p role="status" className="pipeline-summary">{summary}</p>
            </div>

            <ol className="loading-steps" aria-label="Analysis steps">
                {steps.map((s, i) => (
                    <motion.li
                        key={s.step}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="loading-step"
                        data-status={s.status}
                        aria-current={s.status === "running" ? "step" : undefined}
                    >
                        <div className="loading-status-icon" aria-hidden="true">{statusIcon[s.status]}</div>
                        <div className="flex-1 min-w-0">
                            <div className="pipeline-step-heading">
                                <span aria-hidden="true">{stepConfig[s.step].icon}</span>
                                <span className="loading-step-label">
                                    {stepConfig[s.step].label}
                                </span>
                                <span className="loading-step-state">{statusLabel[s.status]}</span>
                            </div>
                            <p className="pipeline-step-message">
                                {s.message}
                            </p>
                        </div>
                    </motion.li>
                ))}
            </ol>
        </motion.div>
    );
}
