"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    GitBranch,
    RefreshCw,
    Download,
    Share2,
    ExternalLink,
    Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface NavbarProps {
    owner: string;
    repo: string;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    onExport?: () => void;
    onPrivateRepo?: () => void;
}

export default function Navbar({
    owner,
    repo,
    onRegenerate,
    isRegenerating,
    onExport,
    onPrivateRepo,
}: NavbarProps) {
    const router = useRouter();

    const handleShare = () => {
        const url = `${window.location.origin}/${owner}/${repo}`;
        navigator.clipboard.writeText(url).then(() => {
            toast.success("Link copied to clipboard!", {
                description: url,
            });
        });
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/50 px-4 py-2.5">
            <div className="max-w-[1800px] mx-auto flex items-center justify-between">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                    <div className="w-7 h-7 rounded-lg bg-indigo flex items-center justify-center">
                        <GitBranch className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-lg font-bold gradient-text hidden sm:block">
                        GitViz
                    </span>
                </Link>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 text-sm">
                    <button
                        onClick={() => router.push(`/${owner}`)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {owner}
                    </button>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="text-foreground font-medium">{repo}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onPrivateRepo}
                        className="text-muted-foreground hover:text-foreground hidden sm:flex"
                    >
                        <Lock className="w-4 h-4 mr-1.5" />
                        Private
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRegenerate}
                        disabled={isRegenerating}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw
                            className={`w-4 h-4 mr-1.5 ${isRegenerating ? "animate-spin" : ""}`}
                        />
                        <span className="hidden sm:inline">Regenerate</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExport}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <Download className="w-4 h-4 mr-1.5" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleShare}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <Share2 className="w-4 h-4 mr-1.5" />
                        <span className="hidden sm:inline">Share</span>
                    </Button>

                    <a
                        href={`https://github.com/${owner}/${repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <ExternalLink className="w-4 h-4 mr-1.5" />
                            <span className="hidden sm:inline">GitHub</span>
                        </Button>
                    </a>
                </div>
            </div>
        </nav>
    );
}
