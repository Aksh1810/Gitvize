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
        { title: "Graph key", body: "Open Graph key to read the root, folder, file-type and symbol encodings used in the graph." },
        { title: "Symbol overlay", body: "Toggle 'Symbols' to show or hide extracted code symbols. Use Symbol Types in Filters to choose which kinds appear." },
        { title: "Filter panel", body: "Use Node Types to show or hide roots, folders, and files. Edge Types controls the connections shown. Reset restores the default filters." },
        { title: "Code inspector", body: "Select a file in the explorer or graph to open its path, code and metadata in the inspector. File-loading errors appear there." },
        { title: "Focus mode", body: "Click a node to dim everything except its direct connections — click the background to reset." },
    ],
    architecture: [
        { title: "Module map", body: "Switch between Overview and Key files to explore the available diagram. Use Fit to frame it, or pan and zoom to inspect a connection." },
        { title: "AI analysis", body: "Click 'Generate Premium Diagram' to request an AI-generated architecture summary. Provider access and request limits still apply." },
        { title: "Mermaid source", body: "The underlying diagram is Mermaid-based — you can copy the source and paste it into any Mermaid-compatible tool." },
    ],
    contributors: [
        { title: "Contributor list", body: "The list uses available contributor commit counts. Bars compare counts with the top contributor in the loaded data; a notice identifies a truncated list." },
        { title: "Sorting", body: "Use the dropdown to sort by most commits or alphabetically by name." },
        { title: "Search", body: "Type in the search box to quickly filter contributors by username." },
        { title: "Profile links", body: "Click any contributor row to open their GitHub profile in a new tab." },
    ],
    branches: [
        { title: "Commit view", body: "Choose the default branch or search the other loaded branches, then browse the date-grouped commit list. Counts distinguish shown choices from loaded branch records." },
        { title: "Graph view", body: "Switch to Graph for a rail-style visualization showing commit parents and merge points." },
        { title: "Load more", body: "When available, use +100 or Load all in the bottom bar to request more default-branch history. Incomplete-history notices still apply to the available results." },
        { title: "Search & sort", body: "Filter commits by message, author, or SHA. Sort by newest, oldest, or author name." },
    ],
    dependencies: [
        { title: "Package list", body: "Each package row shows its name, category and available description and version." },
        { title: "Available metadata", body: "Weekly download counts and Homepage links appear when package metadata provides them. Missing metadata does not mean a package has no usage or homepage." },
        { title: "Direct vs dev", body: "The direct label identifies a runtime dependency. The dev label identifies a development dependency." },
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
            <DialogContent className="settings-dialog settings-help sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="capitalize"><Lightbulb className="settings-heading-icon" aria-hidden="true" />Explore {activeTab}</DialogTitle>
                    <DialogDescription>Tips for this view. Close with Escape or the close button.</DialogDescription>
                </DialogHeader>
                <div className="settings-dialog-body">
                    {tips.map((tip) => (
                        <div key={tip.title} className="settings-section settings-tip">
                            <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                            <div><h3>{tip.title}</h3><p className="settings-note">{tip.body}</p></div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
