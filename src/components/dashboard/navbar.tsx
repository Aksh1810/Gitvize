"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import {
    GitBranch,
    Download,
    Share2,
    Star,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface NavbarProps {
    owner: string;
    repo: string;
    onExport?: () => void;
    onAISettings?: () => void;
}

export default function Navbar({
    owner,
    repo,
    onExport,
    onAISettings,
}: NavbarProps) {
    const { scrollY } = useScroll();
    const background = useTransform(
        scrollY,
        [0, 80],
        ["rgba(10, 14, 26, 0.55)", "rgba(10, 14, 26, 0.92)"]
    );
    const borderColor = useTransform(
        scrollY,
        [0, 80],
        ["rgba(99, 102, 241, 0.18)", "rgba(99, 102, 241, 0.4)"]
    );
    const shadow = useTransform(
        scrollY,
        [0, 80],
        ["0 8px 24px rgba(2, 6, 23, 0.25)", "0 16px 40px rgba(2, 6, 23, 0.55)"]
    );

    const handleShare = () => {
        const url = `${window.location.origin}/${owner}/${repo}`;
        navigator.clipboard.writeText(url).then(() => {
            toast.success("Link copied to clipboard!", {
                description: url,
            });
        });
    };

    return (
        <motion.nav
            className="fixed top-0 left-0 right-0 z-50 px-4 py-3"
            style={{ backgroundColor: background, borderColor, boxShadow: shadow, borderBottomWidth: "1px" }}
        >
            <div className="absolute inset-0 nav-sheen" />
            <div className="max-w-[1800px] mx-auto flex items-center justify-between relative">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-3 group"
                >
                    <div className="relative">
                        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-indigo-500/60 via-cyan-500/30 to-pink-500/50 blur" />
                        <div className="relative w-9 h-9 rounded-2xl bg-[#0b1120] border border-indigo-500/40 flex items-center justify-center">
                            <GitBranch className="w-4 h-4 text-indigo-300 group-hover:text-indigo-200 transition-colors" />
                        </div>
                    </div>
                    <div className="hidden sm:flex flex-col">
                        <span className="text-lg font-semibold tracking-tight gradient-text">GitViz</span>
                        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Neon Repo Atlas</span>
                    </div>
                </Link>

                {/* Breadcrumb */}
                <div className="hidden md:flex items-center gap-2 text-sm">
                    <a
                        href={`https://github.com/${owner}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {owner}
                    </a>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                        {repo}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAISettings}
                        className="rounded-full border border-white/10 bg-white/5 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground"
                    >
                        <Sparkles className="w-4 h-4 mr-1.5 text-cyan-300" />
                        <span className="hidden sm:inline">AI Key</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExport}
                        className="rounded-full border border-white/10 bg-white/5 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground"
                    >
                        <Download className="w-4 h-4 mr-1.5 text-indigo-300" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleShare}
                        className="rounded-full border border-white/10 bg-white/5 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground"
                    >
                        <Share2 className="w-4 h-4 mr-1.5 text-pink-300" />
                        <span className="hidden sm:inline">Share</span>
                    </Button>

                    <a
                        href="https://github.com/Aksh1810/Gitviz"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full border border-white/10 bg-white/5 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground"
                        >
                            <Star className="w-4 h-4 mr-1.5 text-amber-300" />
                            <span className="hidden sm:inline">Star</span>
                        </Button>
                    </a>
                </div>
            </div>
        </motion.nav>
    );
}
