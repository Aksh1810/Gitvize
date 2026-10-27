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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Contributor } from "@/types";

function AvatarWithFallback({ src, alt, className }: { src?: string; alt: string; className: string }) {
    const [error, setError] = useState(false);
    if (!src || error) {
        return (
            <div className={`${className} atlas-avatar-fallback flex items-center justify-center`}>
                <User className="w-4 h-4 text-muted-foreground" />
            </div>
        );
    }
    return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
}

interface ContributorsNetworkProps {
    contributors: Contributor[];
    truncated?: boolean;
    fetchError?: string | null;
}

export default function ContributorsNetwork({
    contributors,
    truncated,
    fetchError,
}: ContributorsNetworkProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"commits" | "name">("commits");

    if (contributors.length === 0) {
        const emptyMsg =
            fetchError === "rate_limited"
                ? "GitHub API rate limit reached. Add a token to load contributor data."
                : fetchError
                ? "Failed to load contributor data. Try adding a GitHub token."
                : "No contributors found for this repository.";
        return (
            <div className="atlas-list-view atlas-list-state" role={fetchError ? "alert" : "status"}>
                <div className="text-center">
                    <div className="text-4xl mb-4">👥</div>
                    <p className="text-sm text-muted-foreground">{emptyMsg}</p>
                    {fetchError && (
                        <p className="text-xs text-muted-foreground mt-1">
                            Add a GitHub Personal Access Token to increase rate limits.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="atlas-list-view">
            {/* Header bar */}
            <div className="atlas-list-toolbar">
                <div className="atlas-list-title">
                    <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-semibold">People</span>
                    <Badge variant="secondary" className="text-xs">{contributors.length}</Badge>
                </div>
                <div className="relative flex items-center">
                    <ArrowUpDown className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <select aria-label="Sort contributors" value={sortBy} onChange={(e) => setSortBy(e.target.value as "commits" | "name")} className="atlas-list-sort">
                        <option value="commits">Most commits</option>
                        <option value="name">Name A–Z</option>
                    </select>
                </div>
                <div className="atlas-list-search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <Input type="text" placeholder="Search contributors..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search contributors" className="pl-9 pr-10" />
                    {searchQuery && (
                        <Button variant="ghost" size="icon" aria-label="Clear contributor search" onClick={() => setSearchQuery("")} className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {truncated && (
                <div role="status" className="atlas-list-notice px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200 bg-amber-500/5 border-b border-border">
                    Showing top {contributors.length} contributors by commit count
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <ListView
                    contributors={contributors}
                    searchQuery={searchQuery}
                    sortBy={sortBy}
                />
            </div>
        </div>
    );
}

/* ─── List View ─── */

interface ListViewProps {
    contributors: Contributor[];
    searchQuery: string;
    sortBy: "commits" | "name";
}

function ListView({ contributors, searchQuery, sortBy }: ListViewProps) {
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
        <div className="atlas-list-scroll custom-scrollbar">
            <div className="atlas-list-body">
                <div className="atlas-list-summary"><p>
                    {contributors.reduce((total, contributor) => total + contributor.contributions, 0).toLocaleString()} commits across {contributors.length} contributors
                </p></div>

                {/* Contributors list */}
                <div className="atlas-contributor-list">
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
                                className="atlas-contributor group"
                            >
                                <span className="text-xs text-muted-foreground text-right font-mono">
                                    #{rank}
                                </span>
                                <AvatarWithFallback
                                    src={contributor.avatarUrl}
                                    alt={contributor.login}
                                    className="w-8 h-8 rounded-md shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="atlas-contributor-name text-sm font-medium">
                                            {contributor.login}
                                        </span>
                                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                                    </div>
                                    <div className="flex items-center mt-1.5">
                                        <div className="atlas-contribution-track flex-1 h-1 rounded-full overflow-hidden">
                                            <div
                                                className="atlas-contribution-fill h-full rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1" aria-label={`${contributor.contributions.toLocaleString()} commits`}>
                                    <GitCommit className="w-3 h-3" aria-hidden="true" />
                                    {contributor.contributions.toLocaleString()}
                                </span>
                            </motion.a>
                        );
                    })}
                    {filtered.length === 0 && (
                        <div className="atlas-list-state text-sm text-muted-foreground" role="status">
                            No contributors match your search.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
