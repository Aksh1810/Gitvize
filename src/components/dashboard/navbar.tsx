"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    Download,
    Share2,
    Star,
    Sparkles,
    KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/ui/brand-logo";
import { toast } from "sonner";
import { transitions } from "@/lib/motion";

interface NavbarProps {
    owner: string;
    repo: string;
    onExport?: () => void;
    onAISettings?: () => void;
    onGithubToken?: () => void;
}

export default function Navbar({
    owner,
    repo,
    onExport,
    onAISettings,
    onGithubToken,
}: NavbarProps) {
    const handleShare = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            toast.success("Link copied to clipboard!", {
                description: url,
            });
        });
    };

    return (
        <motion.nav
            className="fixed top-0 left-0 right-0 z-50 px-4 py-3 backdrop-blur-xl bg-[#0a0e1a]/80 border-b border-white/[0.10]"
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={transitions.soft}
        >
            <div className="max-w-[1800px] mx-auto flex items-center justify-between relative">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-3 group"
                >
                    <BrandLogo size={36} className="interactive-lift" />
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
                    <a
                        href={`https://github.com/${owner}/${repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-white font-semibold tracking-tight hover:bg-indigo-500/20 transition-colors"
                    >
                        {repo}
                    </a>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <a
                        href={`https://github.com/Aksh1810/gitvize`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Star this repo on GitHub"
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
                        onClick={onGithubToken}
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <KeyRound className="w-4 h-4 mr-1.5 text-emerald-300" />
                        <span className="hidden sm:inline">Token</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAISettings}
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Sparkles className="w-4 h-4 mr-1.5 text-cyan-200" />
                        <span className="hidden sm:inline">AI</span>
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
