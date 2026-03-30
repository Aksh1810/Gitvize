"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    User,
    Users,
    Search,
    X,
    ArrowUpDown,
    ExternalLink,
    GitCommit,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Contributor } from "@/types";

function AvatarWithFallback({ src, alt, className }: { src?: string; alt: string; className: string }) {
    const [error, setError] = useState(false);
    if (!src || error) {
        return (
            <div className={`${className} flex items-center justify-center bg-white/10`}>
                <User className="w-4 h-4 text-muted-foreground" />
            </div>
        );
    }
    return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
}

interface ContributorsNetworkProps {
    contributors: Contributor[];
}

export default function ContributorsNetwork({
    contributors,
}: ContributorsNetworkProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"commits" | "name">("commits");

    if (contributors.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">👥</div>
                    <p className="text-sm text-gray-400">No contributor data available.</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Try adding a GitHub Personal Access Token for private repos.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Header bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/20">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-semibold">Contributors</span>
                    <Badge variant="secondary" className="text-[10px]">{contributors.length}</Badge>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                <ListView
                    contributors={contributors}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                />
            </div>
        </div>
    );
}

/* ─── List View ─── */

interface ListViewProps {
    contributors: Contributor[];
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    sortBy: "commits" | "name";
    setSortBy: (s: "commits" | "name") => void;
}

function ListView({ contributors, searchQuery, setSearchQuery, sortBy, setSortBy }: ListViewProps) {
    const maxContributions = contributors[0]?.contributions ?? 1;

    const filtered = useMemo(() => {
        let result = [...contributors];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((c) => c.login.toLowerCase().includes(q));
        }
        if (sortBy === "name") {
            result.sort((a, b) => a.login.localeCompare(b.login));
        } else {
            result.sort((a, b) => b.contributions - a.contributions);
        }
        return result;
    }, [contributors, searchQuery, sortBy]);

    return (
        <div className="w-full h-full overflow-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-5 space-y-5">

                {/* Controls */}
                <div className="flex items-center justify-end gap-2">
                    <div className="relative flex items-center">
                        <ArrowUpDown className="absolute left-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as "commits" | "name")}
                            className="h-8 pl-7 pr-3 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-colors appearance-none cursor-pointer text-foreground"
                        >
                            <option value="commits">Most commits</option>
                            <option value="name">Name A–Z</option>
                        </select>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 w-[160px] pl-8 pr-8 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-colors"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Contributors list */}
                <div className="space-y-1">
                    {filtered.map((contributor, idx) => {
                        const pct = (contributor.contributions / maxContributions) * 100;
                        const rank = contributors.findIndex((c) => c.login === contributor.login) + 1;

                        return (
                            <motion.a
                                key={contributor.login}
                                href={contributor.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                                className="group flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/20 border border-transparent hover:border-border/20 transition-colors cursor-pointer"
                            >
                                <span className="text-[11px] text-muted-foreground/50 w-6 text-right shrink-0 font-mono">
                                    #{rank}
                                </span>
                                <AvatarWithFallback
                                    src={contributor.avatarUrl}
                                    alt={contributor.login}
                                    className="w-8 h-8 rounded-full shrink-0 ring-1 ring-border/20"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate group-hover:text-white transition-colors">
                                            {contributor.login}
                                        </span>
                                        <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1 rounded-full bg-secondary/30 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-cyan-500/60 transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums flex items-center gap-1">
                                    <GitCommit className="w-3 h-3" />
                                    {contributor.contributions.toLocaleString()}
                                </span>
                            </motion.a>
                        );
                    })}
                </div>

                {filtered.length === 0 && (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                        No contributors match your search.
                    </div>
                )}
            </div>
        </div>
    );
}
