"use client";

import { motion } from "framer-motion";
import {
    Star,
    GitFork,
    Eye,
    AlertCircle,
    ExternalLink,
    FolderGit2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RepoMetadata, ArchitectureAnalysis } from "@/types";
import { transitions } from "@/lib/motion";

interface RepoOverviewProps {
    metadata: RepoMetadata;
    analysis?: ArchitectureAnalysis | null;
    repo: string;
}

const statItems = [
    { key: "stars", icon: Star, label: "Stars" },
    { key: "forks", icon: GitFork, label: "Forks" },
    { key: "watchers", icon: Eye, label: "Watchers" },
    { key: "openIssues", icon: AlertCircle, label: "Issues" },
] as const;

// Languages already shown in the donut chart — filter these from tech stack
const languageNames = new Set([
    "typescript", "javascript", "python", "go", "rust", "java",
    "c", "c++", "c#", "ruby", "php", "swift", "kotlin", "scala",
    "dart", "r", "perl", "lua", "shell", "html", "css",
]);

export default function RepoOverview({
    metadata,
    analysis,
    repo,
}: RepoOverviewProps) {
    // Filter tech stack to only show frameworks/tools, not raw languages
    const filteredTechStack = analysis?.techStack?.filter(
        (tech) => !languageNames.has(tech.toLowerCase())
    ) || [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transitions.soft}
            className="surface-neo p-6 max-w-3xl"
        >
            {/* Repo Name with GitHub link */}
            <a
                href={metadata.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group mb-5 block rounded-xl border border-white/12 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-indigo-300/35 hover:bg-white/[0.05]"
            >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <FolderGit2 className="h-3 w-3" />
                    Repository
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-foreground transition-colors group-hover:text-white">
                        {repo}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-white" />
                </div>
            </a>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {statItems.map(({ key, icon: Icon, label }) => (
                    <div
                        key={key}
                        className="flex flex-col items-center justify-center p-3 rounded-lg border border-white/12 bg-white/[0.03] interactive-lift"
                    >
                        <Icon className="w-3.5 h-3.5 mb-1 text-white/70" />
                        <div className="text-lg font-bold text-white/95">
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

            {/* Topics */}
            {metadata.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {metadata.topics.map((topic) => (
                        <Badge
                            key={topic}
                            variant="secondary"
                            className="text-[10px] pro-muted-chip"
                        >
                            {topic}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Tech Stack (frameworks/tools only) */}
            {filteredTechStack.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Tech Stack
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {filteredTechStack.map((tech) => (
                            <Badge
                                key={tech}
                                variant="outline"
                                className="text-xs border-white/15 text-white/80 bg-white/[0.02]"
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

