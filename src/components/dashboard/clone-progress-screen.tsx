"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Circle, Loader2, XCircle, GitBranch } from "lucide-react";
import BrandLogo from "@/components/ui/brand-logo";
import Link from "next/link";

export type CloneStep =
    | "checking"
    | "metadata"
    | "cloning"
    | "reading"
    | "done"
    | "error";

interface CloneProgressScreenProps {
    owner: string;
    repo: string;
    currentStep: CloneStep;
    message: string;
    error?: string;
    onRetry?: () => void;
}

const STEPS: { key: CloneStep; label: string }[] = [
    { key: "checking",  label: "Checking access" },
    { key: "metadata",  label: "Fetching metadata" },
    { key: "cloning",   label: "Cloning repository" },
    { key: "reading",   label: "Reading data" },
    { key: "done",      label: "Complete" },
];

const STEP_ORDER: CloneStep[] = ["checking", "metadata", "cloning", "reading", "done"];

function stepIndex(step: CloneStep) {
    return STEP_ORDER.indexOf(step);
}

export default function CloneProgressScreen({
    owner,
    repo,
    currentStep,
    message,
    error,
    onRetry,
}: CloneProgressScreenProps) {
    const currentIdx = stepIndex(currentStep === "error" ? "checking" : currentStep);

    return (
        <div className="atlas-loading w-full flex flex-col items-center justify-center py-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative z-10 w-full max-w-md px-6"
            >
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <BrandLogo size={40} />
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">Gitvize</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-sm font-semibold text-white">{owner}/{repo}</span>
                        </div>
                    </div>
                </div>

                {/* Progress card */}
                <div className="atlas-loading-card" aria-busy={currentStep !== "done" && currentStep !== "error"}>
                    <h1>{currentStep === "error" ? "Let’s try another route." : "Connecting the dots."}</h1>
                    {currentStep === "error" ? (
                        <div className="space-y-4" role="alert">
                            <div className="flex items-start gap-3">
                                <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-red-300">Failed to load repository</p>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{error}</p>
                                </div>
                            </div>
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="w-full mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 py-2 text-sm text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                                >
                                    Try again
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {STEPS.map((step, idx) => {
                                const isDone = idx < currentIdx || currentStep === "done";
                                const isActive = idx === currentIdx && currentStep !== "done";
                                const isPending = idx > currentIdx && currentStep !== "done";

                                return (
                                    <motion.div
                                        key={step.key}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: isPending ? 0.7 : 1, x: 0 }}
                                        transition={{ delay: idx * 0.06 }}
                                        className="flex items-center gap-3"
                                    >
                                        <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                            {isDone ? (
                                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            ) : isActive ? (
                                                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-white/20" />
                                            )}
                                        </div>
                                        <span className={`text-sm ${isDone ? "text-emerald-300" : isActive ? "text-white font-medium" : "text-muted-foreground"}`}>
                                            {step.label}
                                        </span>
                                    </motion.div>
                                );
                            })}

                            {/* Live message */}
                            <AnimatePresence mode="wait">
                                <motion.p
                                    key={message}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    role="status"
                                    className="text-xs text-slate-400 pt-3 border-t border-white/10"
                                >
                                    {message || "Working..."}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <p className="text-center text-xs text-slate-400 mt-4">
                    Larger repositories may take a little longer to map.
                </p>
                <Link href="/" className="atlas-return">← Explore another repository</Link>
            </motion.div>
        </div>
    );
}
