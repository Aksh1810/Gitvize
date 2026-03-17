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
import { transitions } from "@/lib/motion";

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
        ["rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.2)"]
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
            className="fixed top-0 left-0 right-0 z-50 px-4 py-3 backdrop-blur-2xl"
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={transitions.soft}
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
                        <div className="relative w-9 h-9 rounded-2xl bg-black/70 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center justify-center interactive-lift">
                            <GitBranch className="w-4 h-4 text-white/85 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                    <div className="hidden sm:flex flex-col">
                        <span className="text-lg font-semibold tracking-tight text-white">Gitvize</span>
                    </div>
                </Link>

                {/* Breadcrumb */}
                <div className="hidden md:flex items-center gap-2 ui-body">
                    <a
                        href={`https://github.com/${owner}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-full border border-white/14 bg-white/[0.03] text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {owner}
                    </a>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="text-muted-foreground">
                        {repo}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <a
                        href="https://github.com/Aksh1810/Gitviz"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className="pro-control pro-focus-ring ui-micro"
                        >
                            <Star className="w-4 h-4 mr-1.5 text-amber-200" />
                            <span className="hidden sm:inline">Star</span>
                        </Button>
                    </a>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAISettings}
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Sparkles className="w-4 h-4 mr-1.5 text-cyan-200" />
                        <span className="hidden sm:inline">AI Key</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExport}
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Download className="w-4 h-4 mr-1.5 text-white/80" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleShare}
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Share2 className="w-4 h-4 mr-1.5 text-white/80" />
                        <span className="hidden sm:inline">Share</span>
                    </Button>

                </div>
            </div>
        </motion.nav>
    );
}
