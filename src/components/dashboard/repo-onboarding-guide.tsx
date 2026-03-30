"use client";

import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, X, Lightbulb } from "lucide-react";

/* ─── Per-tab tips ─── */

interface Tip {
    title: string;
    body: string;
}

const TAB_TIPS: Record<string, Tip[]> = {
    files: [
        { title: "Node colors", body: "Folders are shown as larger nodes, files as smaller ones. Colors correspond to file type — hover any node to see its full path." },
        { title: "Symbol overlay", body: "Toggle 'Show Symbols' to see classes, functions, and interfaces extracted from each file. Pink edges show cross-file references." },
        { title: "Filter panel", body: "Use the filters to hide folders, limit depth, or focus on specific file types. This helps untangle large repos." },
        { title: "Code inspector", body: "Click any file node to open a preview panel on the right showing its contents and metadata." },
        { title: "Focus mode", body: "Click a node to dim everything except its direct connections — click the background to reset." },
    ],
    architecture: [
        { title: "Module map", body: "The diagram shows how top-level modules relate to each other. Arrows indicate import/dependency direction." },
        { title: "AI analysis", body: "Click 'Generate Premium Diagram' to get a richer, AI-generated summary of the repo's architecture." },
        { title: "Mermaid source", body: "The underlying diagram is Mermaid-based — you can copy the source and paste it into any Mermaid-compatible tool." },
    ],
    contributors: [
        { title: "Contributor list", body: "Contributors are ranked by total commits. The progress bar shows each person's share relative to the top contributor." },
        { title: "Sorting", body: "Use the dropdown to sort by most commits or alphabetically by name." },
        { title: "Search", body: "Type in the search box to quickly filter contributors by username." },
        { title: "Profile links", body: "Click any contributor row to open their GitHub profile in a new tab." },
    ],
    branches: [
        { title: "Commit view", body: "Shows all branches as colored pills, plus a date-grouped commit list you can scroll through." },
        { title: "Graph view", body: "Switch to Graph for a rail-style visualization showing commit parents and merge points." },
        { title: "Load more", body: "If the repo has many commits, use the bottom bar buttons to load additional pages or fetch the entire history." },
        { title: "Search & sort", body: "Filter commits by message, author, or SHA. Sort by newest, oldest, or author name." },
    ],
    dependencies: [
        { title: "Package cards", body: "Each dependency is shown as a card with its name, category badge, description, and version." },
        { title: "Popular badge", body: "Packages with a star badge are widely used across the ecosystem (500K+ weekly npm downloads)." },
        { title: "Direct vs dev", body: "The indigo 'direct' label means the package is a runtime dependency. Purple 'dev' means it's only used during development." },
        { title: "Quick links", body: "Each card has 'Learn more' (npm page) and 'Homepage' links that open in a new tab." },
        { title: "Search & sort", body: "Filter packages by name, description, or category. Sort by type, name, or category grouping." },
    ],
};

/* ─── Component ─── */

interface QuickTipsProps {
    open: boolean;
    activeTab: string;
    onClose: () => void;
}

export default function RepoOnboardingGuide({
    open,
    activeTab,
    onClose,
}: QuickTipsProps) {
    const tips = TAB_TIPS[activeTab] ?? TAB_TIPS.files;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[70]"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute right-4 top-20 w-[min(400px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] rounded-2xl border border-white/15 bg-[#0a1020]/95 shadow-[0_20px_50px_rgba(2,6,23,0.6)] flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <Lightbulb className="w-4 h-4 text-amber-400" />
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Quick Tips</p>
                                    <h3 className="text-sm font-semibold text-slate-100 capitalize">{activeTab} tab</h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 transition-colors"
                                aria-label="Close quick tips"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Tips list */}
                        <div className="flex-1 overflow-auto custom-scrollbar px-4 py-3 space-y-2.5">
                            {tips.map((tip, i) => (
                                <motion.div
                                    key={tip.title}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04, duration: 0.15 }}
                                    className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.07] px-3 py-2.5"
                                >
                                    <div className="flex items-start gap-2">
                                        <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-400" />
                                        <div>
                                            <p className="text-xs font-medium text-slate-100">{tip.title}</p>
                                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{tip.body}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
