"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    Download,
    Share2,
    ExternalLink,
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
        }).catch(() => {
            toast.error("Could not copy the link. Copy it from your address bar instead.");
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

                <div className="hidden md:flex items-center ui-body">
                    <a
                        href={`https://github.com/${owner}/${repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white pro-focus-ring rounded px-2 py-1"
                    >
                        View on GitHub <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onGithubToken}
                        aria-label="GitHub token"
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <KeyRound className="w-4 h-4 mr-1.5 text-emerald-300" />
                        <span className="hidden sm:inline">GitHub token</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAISettings}
                        aria-label="AI settings"
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Sparkles className="w-4 h-4 mr-1.5 text-cyan-200" />
                        <span className="hidden sm:inline">AI settings</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExport}
                        aria-label="Export repository data"
                        className="pro-control pro-focus-ring ui-micro"
                    >
                        <Download className="w-4 h-4 mr-1.5 text-white/80" />
                        <span className="hidden sm:inline">Export data</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleShare}
                        aria-label="Copy share link"
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
