"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Circle, Loader2, XCircle, GitBranch, ArrowLeft } from "lucide-react";
import BrandLogo from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
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
    { key: "metadata",  label: "Fetching repository details" },
    { key: "cloning",   label: "Cloning repository" },
    { key: "reading",   label: "Reading repository data" },
    { key: "done",      label: "Repository ready" },
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
        <div className="atlas-loading">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="atlas-loading-content"
            >
                {/* Header */}
                <div className="loading-repo-heading">
                    <BrandLogo size={32} className="shrink-0" />
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Gitvize</p>
                        <div className="flex items-start gap-2">
                            <GitBranch className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                            <span className="loading-repo-name">{owner}/{repo}</span>
                        </div>
                    </div>
                </div>

                {/* Progress card */}
                <div className="atlas-loading-card" aria-busy={currentStep !== "done" && currentStep !== "error"}>
                    <h1>{currentStep === "error" ? "Could not load repository" : currentStep === "done" ? "Repository ready" : "Loading repository"}</h1>
                    {currentStep === "error" ? (
                        <div className="space-y-4" role="alert">
                            <div className="loading-error-message">
                                <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                                <p>{error}</p>
                            </div>
                            {onRetry && (
                                <Button
                                    type="button"
                                    onClick={onRetry}
                                >
                                    Try again
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div>
                            <ol className="loading-steps" aria-label="Repository loading steps">
                                {STEPS.map((step, idx) => {
                                    const isDone = idx < currentIdx || currentStep === "done";
                                    const isActive = idx === currentIdx && currentStep !== "done";

                                    return (
                                        <motion.li
                                            key={step.key}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.06 }}
                                            className="loading-step"
                                            data-status={isDone ? "complete" : isActive ? "running" : "pending"}
                                            aria-current={isActive ? "step" : undefined}
                                        >
                                            <div className="loading-status-icon" aria-hidden="true">
                                                {isDone ? (
                                                    <CheckCircle className="w-4 h-4" />
                                                ) : isActive ? (
                                                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                                                ) : (
                                                    <Circle className="w-4 h-4" />
                                                )}
                                            </div>
                                            <span className="loading-step-label">{step.label}</span>
                                            <span className="loading-step-state">{isDone ? "Complete" : isActive ? "In progress" : "Waiting"}</span>
                                        </motion.li>
                                    );
                                })}
                            </ol>

                            {/* Live message */}
                            <AnimatePresence mode="wait">
                                <motion.p
                                    key={message}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    role="status"
                                    className="loading-message"
                                >
                                    {message || (currentStep === "done" ? "Repository data is ready." : "Loading repository…")}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <p className="loading-note">
                    Larger repositories may take longer to load.
                </p>
                <Button asChild variant="outline" className="atlas-return"><Link href="/"><ArrowLeft className="w-4 h-4" aria-hidden="true" />Explore another repository</Link></Button>
            </motion.div>
        </div>
    );
}
