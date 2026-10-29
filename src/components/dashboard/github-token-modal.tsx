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
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";

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
    onSave: (token: string) => void | Promise<void>;
}

export default function GitHubTokenModal({ open, onOpenChange, onSave }: GitHubTokenModalProps) {
    const [token, setToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleOpenChange = (nextOpen: boolean) => {
        if (saving) return;
        onOpenChange(nextOpen);
        setToken("");
        setShowToken(false);
        setError(null);
    };

    const normalized = token.trim();
    const canSave = normalized.length >= 20;

    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        setError(null);
        try {
            await onSave(normalized);
            onOpenChange(false);
            setToken("");
            setShowToken(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not verify your token. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="settings-dialog sm:max-w-[560px]" aria-busy={saving}>
                <DialogHeader>
                    <DialogTitle><KeyRound className="settings-heading-icon" aria-hidden="true" />Connect to GitHub<Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></DialogTitle>
                    <DialogDescription>Use a Personal Access Token for private repository access or higher GitHub API limits. The token is not saved to local storage.</DialogDescription>
                </DialogHeader>

                <div className="settings-dialog-body">
                    <section className="settings-section" aria-labelledby="github-token-use">
                        <h3 id="github-token-use"><ShieldCheck className="w-4 h-4" aria-hidden="true" />How this token is used</h3>
                        <ul className="settings-instructions">
                            <li>Held in memory for the open repository. Session storage carries a one-time hand-off when opening a repository page.</li>
                            <li>Sent to Gitvize’s server to authenticate requests to GitHub.</li>
                            <li>Limit the token to the repositories you want to explore.</li>
                            <li>Revoke it at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="settings-link underline underline-offset-2">github.com/settings/tokens</a>.</li>
                        </ul>
                        <a href="https://github.com/Aksh1810/Gitvize" target="_blank" rel="noopener noreferrer" className="settings-link"><ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />Read Gitvize’s source</a>
                    </section>

                    <section className="settings-section">
                        <div className="settings-field-heading">
                            <Label htmlFor="github-access-token">Personal Access Token</Label>
                            <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Gitvize" target="_blank" rel="noopener noreferrer" className="settings-link">Create token <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></a>
                        </div>
                        <div className="settings-secret-field">
                            <Input
                                id="github-access-token"
                                type={showToken ? "text" : "password"}
                                value={token}
                                onChange={(e) => { setToken(e.target.value); setError(null); }}
                                disabled={saving}
                                aria-invalid={!!error || (!!normalized && !canSave)}
                                aria-describedby={error ? "github-token-help github-token-error" : "github-token-help"}
                                autoComplete="off"
                                placeholder="ghp_... / github_pat_..."
                                className="pr-10 font-mono text-sm"
                            />
                            <Button type="button" variant="ghost" size="icon" className="settings-reveal" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? "Hide token" : "Show token"} aria-pressed={showToken}>
                                {showToken ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                            </Button>
                        </div>
                        <p id="github-token-help" className="settings-field-help">Enter at least 20 characters to continue. Classic token scopes: public_repo for public repositories, or repo for private access.</p>
                    </section>
                    {saving && <p role="status" className="settings-note">Connecting…</p>}
                    {error && <p id="github-token-error" role="alert" className="settings-error">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!canSave || saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                        {saving ? "Connecting…" : "Continue"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
