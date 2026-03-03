"use client";

import { motion } from "framer-motion";
import {
    Star,
    GitFork,
    Eye,
    AlertCircle,
    Scale,
    Clock,
    ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RepoMetadata, ArchitectureAnalysis } from "@/types";

interface RepoOverviewProps {
    metadata: RepoMetadata;
    analysis?: ArchitectureAnalysis | null;
}

const statItems = [
    { key: "stars", icon: Star, label: "Stars" },
    { key: "forks", icon: GitFork, label: "Forks" },
    { key: "watchers", icon: Eye, label: "Watchers" },
    { key: "openIssues", icon: AlertCircle, label: "Issues" },
] as const;

export default function RepoOverview({
    metadata,
    analysis,
}: RepoOverviewProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 max-w-3xl"
        >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {statItems.map(({ key, icon: Icon, label }) => (
                    <div
                        key={key}
                        className="flex flex-col items-center justify-center p-3 rounded-lg bg-secondary/30 border border-border/30"
                    >
                        <div className="text-lg font-bold">
                            {formatCount(metadata[key])}
                        </div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                ))}
            </div>

            {/* Description */}
            {metadata.description && (
                <p className="text-sm text-muted-foreground mb-4">
                    {metadata.description}
                </p>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-muted-foreground">
                <a
                    href={metadata.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo hover:underline"
                >
                    <ExternalLink className="w-3 h-3" />
                    View on GitHub
                </a>
            </div>

            {/* Topics */}
            {metadata.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {metadata.topics.map((topic) => (
                        <Badge
                            key={topic}
                            variant="secondary"
                            className="text-[10px] bg-indigo/10 border-indigo/20 text-indigo"
                        >
                            {topic}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Tech Stack (AI) */}
            {analysis?.techStack && analysis.techStack.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Tech Stack
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {analysis.techStack.map((tech) => (
                            <Badge
                                key={tech}
                                variant="outline"
                                className="text-xs border-cyan/20 text-cyan"
                            >
                                {tech}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}


        </motion.div>
    );
}

function formatCount(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
}
