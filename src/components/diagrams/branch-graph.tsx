"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitBranch,
    GitCommit,
    User,
    Calendar,
    ChevronDown,
    ChevronUp,
    Search,
    X,
    ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Branch, Commit } from "@/types";

const branchColors = [
    "#6366f1", "#22d3ee", "#a855f7", "#10b981",
    "#f59e0b", "#ef4444", "#ec4899", "#3b82f6",
];

interface BranchGraphProps {
    branches: Branch[];
    commits: Commit[];
    defaultBranch: string;
}

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

function groupCommitsByDate(commits: Commit[]): Map<string, Commit[]> {
    const groups = new Map<string, Commit[]>();
    commits.forEach((c) => {
        const date = new Date(c.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(c);
    });
    return groups;
}

export default function BranchGraph({
    branches,
    commits,
    defaultBranch,
}: BranchGraphProps) {
    const [showAllBranches, setShowAllBranches] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "author">("newest");

    const nonDefaultBranches = branches.filter((b) => !b.isDefault);
    const visibleBranches = showAllBranches
        ? nonDefaultBranches
        : nonDefaultBranches.slice(0, 6);

    const filteredCommits = useMemo(() => {
        let result = [...commits];

        // Filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (c) =>
                    c.message.toLowerCase().includes(q) ||
                    c.authorName.toLowerCase().includes(q) ||
                    c.sha.toLowerCase().includes(q)
            );
        }

        // Sort
        if (sortBy === "oldest") {
            result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        } else if (sortBy === "newest") {
            result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } else if (sortBy === "author") {
            result.sort((a, b) => a.authorName.localeCompare(b.authorName));
        }

        return result;
    }, [commits, searchQuery, sortBy]);

    const groupedCommits = useMemo(
        () => groupCommitsByDate(filteredCommits),
        [filteredCommits]
    );

    return (
        <div className="w-full h-full overflow-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

                {/* Branches Section */}
                <div className="glass-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-indigo-400" />
                            <h3 className="text-sm font-semibold">Branches</h3>
                            <Badge variant="secondary" className="text-[10px]">
                                {branches.length}
                            </Badge>
                        </div>
                        {nonDefaultBranches.length > 6 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => setShowAllBranches(!showAllBranches)}
                            >
                                {showAllBranches ? (
                                    <>Show less <ChevronUp className="w-3 h-3 ml-1" /></>
                                ) : (
                                    <>+{nonDefaultBranches.length - 6} more <ChevronDown className="w-3 h-3 ml-1" /></>
                                )}
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {/* Default branch */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium"
                            style={{
                                borderColor: branchColors[0],
                                background: `${branchColors[0]}15`,
                                color: branchColors[0],
                            }}
                        >
                            <GitBranch className="w-3 h-3" />
                            {defaultBranch}
                            <Badge variant="outline" className="text-[9px] ml-1 border-current px-1 py-0">
                                default
                            </Badge>
                        </div>

                        {/* Other branches */}
                        {visibleBranches.map((branch, i) => {
                            const color = branchColors[(i + 1) % branchColors.length];
                            return (
                                <div
                                    key={branch.name}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs"
                                    style={{
                                        borderColor: `${color}40`,
                                        background: `${color}10`,
                                        color: color,
                                    }}
                                >
                                    <GitBranch className="w-3 h-3" />
                                    {branch.name}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Commits Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <GitCommit className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Commits</h3>
                        <Badge variant="secondary" className="text-[10px]">
                            {commits.length}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Sort dropdown */}
                        <div className="relative flex items-center">
                            <ArrowUpDown className="absolute left-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "author")}
                                className="h-8 pl-7 pr-3 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors appearance-none cursor-pointer text-foreground"
                            >
                                <option value="newest">Newest first</option>
                                <option value="oldest">Oldest first</option>
                                <option value="author">Author A–Z</option>
                            </select>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search commits..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 w-[200px] pl-8 pr-8 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Commit Timeline */}
                <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/40" />

                    {filteredCommits.length === 0 ? (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                            No commits match your search.
                        </div>
                    ) : (
                        Array.from(groupedCommits.entries()).map(([date, dayCommits]) => (
                            <div key={date} className="mb-6">
                                {/* Date header */}
                                <div className="flex items-center gap-3 mb-3 ml-1">
                                    <div className="w-[10px] h-[10px] rounded-full bg-muted-foreground/30 border-2 border-background z-10" />
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        {date}
                                    </span>
                                </div>

                                {/* Day's commits */}
                                <div className="space-y-1 ml-10">
                                    {dayCommits.map((commit) => (
                                        <motion.div
                                            key={commit.sha}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedCommit?.sha === commit.sha
                                                ? "bg-indigo-500/10 border border-indigo-500/20"
                                                : "hover:bg-secondary/30 border border-transparent"
                                                }`}
                                            onClick={() =>
                                                setSelectedCommit(
                                                    selectedCommit?.sha === commit.sha ? null : commit
                                                )
                                            }
                                        >
                                            {/* Timeline dot connector */}
                                            <div className="absolute -left-[30px] top-4 w-[20px] h-px bg-border/30" />
                                            <div
                                                className="absolute -left-[34px] top-[12px] w-[8px] h-[8px] rounded-full border-2 z-10"
                                                style={{
                                                    borderColor: branchColors[0],
                                                    background: selectedCommit?.sha === commit.sha ? branchColors[0] : "#0a0e1a",
                                                }}
                                            />

                                            {/* Author avatar */}
                                            {commit.authorAvatar ? (
                                                <img
                                                    src={commit.authorAvatar}
                                                    alt={commit.authorName}
                                                    className="w-7 h-7 rounded-full shrink-0 mt-0.5"
                                                />
                                            ) : (
                                                <div className="w-7 h-7 rounded-full bg-secondary/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                </div>
                                            )}

                                            {/* Commit content */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-foreground leading-snug truncate group-hover:text-white transition-colors">
                                                    {commit.message}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {commit.authorName}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground/50">•</span>
                                                    <span className="text-[11px] text-muted-foreground/70">
                                                        {timeAgo(commit.date)}
                                                    </span>
                                                </div>

                                                {/* Expanded details */}
                                                <AnimatePresence>
                                                    {selectedCommit?.sha === commit.sha && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="mt-2 pt-2 border-t border-border/20 space-y-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <Calendar className="w-3 h-3 text-muted-foreground" />
                                                                    <span className="text-[11px] text-muted-foreground">
                                                                        {new Date(commit.date).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                                                                    <Badge variant="outline" className="text-[9px]">
                                                                        {defaultBranch}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* SHA badge */}
                                            <code className="text-[10px] text-indigo-400/70 bg-indigo-500/10 px-1.5 py-0.5 rounded font-mono shrink-0 mt-1">
                                                {commit.sha}
                                            </code>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
