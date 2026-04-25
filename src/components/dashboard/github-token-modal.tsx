"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, ExternalLink } from "lucide-react";

export const GITHUB_PAT_TRANSIENT_KEY = "gitvize_github_pat_once";
const GITHUB_PAT_LEGACY_TRANSIENT_KEY = "gitviz_github_pat_once";
const GITHUB_PAT_LEGACY_STORAGE_KEY = "gitviz_github_pat";

export function setOneTimeGitHubToken(token: string) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(GITHUB_PAT_TRANSIENT_KEY, token.trim());
    sessionStorage.removeItem(GITHUB_PAT_LEGACY_TRANSIENT_KEY);
    // Clean up legacy persisted token if present from older builds.
    localStorage.removeItem(GITHUB_PAT_LEGACY_STORAGE_KEY);
}

export function consumeOneTimeGitHubToken(): string {
    if (typeof window === "undefined") return "";

    const token =
        sessionStorage.getItem(GITHUB_PAT_TRANSIENT_KEY) ??
        sessionStorage.getItem(GITHUB_PAT_LEGACY_TRANSIENT_KEY) ??
        "";
    sessionStorage.removeItem(GITHUB_PAT_TRANSIENT_KEY);
    sessionStorage.removeItem(GITHUB_PAT_LEGACY_TRANSIENT_KEY);
    // Ensure no persisted token remains.
    localStorage.removeItem(GITHUB_PAT_LEGACY_STORAGE_KEY);
    return token;
}

interface GitHubTokenModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (token: string) => void;
}

export default function GitHubTokenModal({ open, onOpenChange, onSave }: GitHubTokenModalProps) {
    const [token, setToken] = useState("");
    const [showToken, setShowToken] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (nextOpen) {
            setToken("");
            setShowToken(false);
        }
    };

    const normalized = token.trim();
    const canSave = normalized.length >= 20;

    const handleSave = () => {
        if (!canSave) return;
        onSave(normalized);
        onOpenChange(false);
        setToken("");
        setShowToken(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="bg-slate-950/95 border-border/80 shadow-2xl sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <KeyRound className="w-5 h-5 text-cyan-300" />
                        GitHub Token
                        <Lock className="w-4 h-4 text-slate-400 ml-auto" />
                    </DialogTitle>
                    <DialogDescription>
                        Add a Personal Access Token to access private repositories and increase rate limits.
                        Your token is used one time for this visualization and is not persisted.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                                Never stored on our servers
                            </span>
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-400">
                            <li>• Stored only in your browser&apos;s session memory — cleared when you close the tab</li>
                            <li>• Sent directly from your browser to GitHub&apos;s API</li>
                            <li>• Never transmitted to or logged by our servers</li>
                            <li>
                                • Revoke anytime at{" "}
                                <a
                                    href="https://github.com/settings/tokens"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cyan-400 hover:underline"
                                >
                                    github.com/settings/tokens
                                </a>
                            </li>
                        </ul>
                        <a
                            href="https://github.com/Aksh1810/Gitviz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" />
                            Don&apos;t trust us? Read the source
                        </a>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/50 bg-slate-900/70 p-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Personal Access Token
                            </Label>
                            <a
                                href="https://github.com/settings/tokens/new?scopes=public_repo&description=GitViz"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:underline"
                            >
                                Create token <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>

                        <div className="relative">
                            <Input
                                type={showToken ? "text" : "password"}
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Paste your token (ghp_... / github_pat_...)"
                                className="pr-10 bg-slate-950/80 border-border/70 font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label={showToken ? "Hide token" : "Show token"}
                            >
                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                            Minimum scope: <span className="text-slate-300 font-medium">public_repo</span> for public repos.
                            Add <span className="text-slate-300 font-medium">repo</span> for private repo access.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white"
                    >
                        Continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
