"use client";

import { BookOpen, Lightbulb } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
        { title: "Quick links", body: "Open a package's registry page from its npm, PyPI, Go docs, or crates.io link. A Homepage link appears when available." },
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
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
            <DialogContent className="border-slate-700 bg-[#152139] sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 capitalize"><Lightbulb className="h-5 w-5 text-blue-300" />Explore {activeTab}</DialogTitle>
                    <DialogDescription>A few ways to find your bearings in this view.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {tips.map((tip) => (
                        <div key={tip.title} className="flex items-start gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4">
                            <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-blue-300" />
                            <div><h3 className="text-sm font-medium text-slate-100">{tip.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-300">{tip.body}</p></div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
