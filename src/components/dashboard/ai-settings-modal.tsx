"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Sparkles } from "lucide-react";

export interface AISettings {
    provider: "openai" | "anthropic" | "gemini";
    apiKey: string;
    model: string;
}

const PROVIDER_DOCS = {
    openai: "https://platform.openai.com/api-keys",
    anthropic: "https://console.anthropic.com/settings/keys",
    gemini: "https://aistudio.google.com/app/apikey",
} as const;

function inferProviderAndModel(apiKey: string): { provider: AISettings["provider"]; model: string } | null {
    const key = apiKey.trim();
    if (key.startsWith("AIza")) {
        return { provider: "gemini", model: "gemini-2.0-flash" };
    }
    if (key.startsWith("sk-ant-")) {
        return { provider: "anthropic", model: "claude-3-5-sonnet-20241022" };
    }
    if (key.startsWith("sk-")) {
        return { provider: "openai", model: "gpt-4o-mini" };
    }
    return null;
}

const STORAGE_KEY = "gitvize_ai_settings";
const LEGACY_STORAGE_KEY = "gitviz_ai_settings";

export function loadAISettings(): AISettings | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as AISettings;
    } catch {
        return null;
    }
}

export function saveAISettings(settings: AISettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function clearAISettings() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
}

interface AISettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (settings: AISettings) => void;
}

export default function AISettingsModal({ open, onOpenChange, onSave }: AISettingsModalProps) {
    const [apiKey, setApiKey] = useState(() => loadAISettings()?.apiKey ?? "");
    const [showKey, setShowKey] = useState(false);
    const hasSavedSettings = Boolean(loadAISettings());

    const inferred = inferProviderAndModel(apiKey);

    const handleSave = () => {
        if (!inferred) return;
        const settings: AISettings = {
            provider: inferred.provider,
            apiKey,
            model: inferred.model,
        };
        saveAISettings(settings);
        onSave(settings);
        onOpenChange(false);
    };

    const isValid = (() => {
        const key = apiKey.trim();
        return key.length >= 12 && inferred !== null;
    })();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-950/95 border-border/80 shadow-2xl sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                        AI Settings
                    </DialogTitle>
                    <DialogDescription>
                        Smart architecture diagrams work by default without any key.
                        Add your API key only if you want Premium AI diagram generation.
                        Your key is stored locally in your browser only.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* API Key */}
                    <div className="space-y-2 rounded-lg border border-border/50 bg-slate-900/70 p-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                API Key
                            </Label>
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-400 hover:underline"
                            >
                                Get a key (Gemini) →
                            </a>
                        </div>
                        <div className="relative">
                            <Input
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Paste your API key (AIza... / sk-... / sk-ant-...)"
                                className="pr-10 bg-slate-950/80 border-border/70 font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Provider and model are auto-selected from your key prefix.
                        </p>
                    </div>

                    {/* Inferred Provider/Model */}
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Auto-Detected
                        </Label>
                        {inferred ? (
                            <div className="rounded-lg border border-border/60 bg-slate-900/80 px-3 py-2 text-xs">
                                <div className="text-foreground font-medium">Provider: {inferred.provider}</div>
                                <div className="text-muted-foreground mt-1">Model: {inferred.model}</div>
                                <a
                                    href={PROVIDER_DOCS[inferred.provider]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 inline-block text-[11px] text-indigo-400 hover:underline"
                                >
                                    Manage {inferred.provider} keys →
                                </a>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                                Key prefix not recognized yet. Use one of: `AIza`, `sk-ant-`, or `sk-`.
                            </div>
                        )}
                    </div>

                    {/* Status */}
                    {hasSavedSettings && (
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">
                                ✓ Configured
                            </Badge>
                            <button
                                onClick={() => {
                                    clearAISettings();
                                    setApiKey("");
                                }}
                                className="text-[10px] text-red-400 hover:underline"
                            >
                                Clear saved key
                            </button>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        Save & Generate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
