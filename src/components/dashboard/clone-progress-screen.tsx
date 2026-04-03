"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Circle, Loader2, XCircle, GitBranch } from "lucide-react";
import BrandLogo from "@/components/ui/brand-logo";

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
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0e1a]">
            {/* Ambient orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-violet-600/8 blur-3xl" />
            </div>

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
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                    {currentStep === "error" ? (
                        <div className="space-y-4">
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
                                        animate={{ opacity: isPending ? 0.35 : 1, x: 0 }}
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
                                    className="text-[11px] text-muted-foreground/60 pt-2 border-t border-white/5"
                                >
                                    {message || "Working..."}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <p className="text-center text-[11px] text-muted-foreground/40 mt-4">
                    Repository is cloned locally — subsequent loads are instant
                </p>
            </motion.div>
        </div>
    );
}
