"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingStep {
    title: string;
    description: string;
    tip?: string;
}

interface RepoOnboardingGuideProps {
    open: boolean;
    stepIndex: number;
    steps: OnboardingStep[];
    onClose: () => void;
    onBack: () => void;
    onNext: () => void;
}

export default function RepoOnboardingGuide({
    open,
    stepIndex,
    steps,
    onClose,
    onBack,
    onNext,
}: RepoOnboardingGuideProps) {
    const step = steps[stepIndex];
    const isLast = stepIndex >= steps.length - 1;

    return (
        <AnimatePresence>
            {open && step && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70]"
                >
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-4 top-20 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#0a1020]/95 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.6)]"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-slate-400">Quick Start Guide</p>
                                <h3 className="mt-1 text-base font-semibold text-slate-100">{step.title}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                                aria-label="Close quick start guide"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="mt-3 text-sm leading-relaxed text-slate-200">{step.description}</p>

                        {step.tip && (
                            <div className="mt-3 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100 flex gap-2">
                                <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>{step.tip}</span>
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs text-slate-400">Step {stepIndex + 1} of {steps.length}</span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onBack}
                                    disabled={stepIndex === 0}
                                    className="h-8 text-xs"
                                >
                                    <ArrowLeft className="w-3 h-3 mr-1" />
                                    Back
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={onNext}
                                    className="h-8 text-xs"
                                >
                                    {isLast ? "Finish" : "Next"}
                                    {!isLast && <ArrowRight className="w-3 h-3 ml-1" />}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
