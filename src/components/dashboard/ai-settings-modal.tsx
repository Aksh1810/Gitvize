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
        return { provider: "gemini", model: "gemini-2.5-flash" };
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
        // In case they had old settings stored permanently, clean them up
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);

        const raw = sessionStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AISettings;
        if (parsed.model === "gemini-2.0-flash") {
            parsed.model = "gemini-2.5-flash";
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveAISettings(settings: AISettings) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    // Cleanup any permanent traces
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function clearAISettings() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    // Cleanup any permanent traces
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
            <DialogContent className="settings-dialog sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle><Sparkles className="settings-heading-icon" aria-hidden="true" />AI settings</DialogTitle>
                    <DialogDescription>
                        Smart architecture diagrams work without a key. Add your own key for Premium AI diagram generation.
                    </DialogDescription>
                </DialogHeader>

                <div className="settings-dialog-body">
                    <section className="settings-section">
                        <div className="settings-field-heading">
                            <Label htmlFor="ai-api-key">API Key</Label>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="settings-link">Get a key (Gemini) →</a>
                        </div>
                        <div className="settings-secret-field">
                            <Input
                                id="ai-api-key"
                                autoComplete="off"
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIza... / sk-... / sk-ant-..."
                                aria-invalid={!!apiKey.trim() && !isValid}
                                aria-describedby="ai-key-help ai-detected"
                                className="pr-10 font-mono text-sm"
                            />
                            <Button type="button" variant="ghost" size="icon" className="settings-reveal" onClick={() => setShowKey(!showKey)} aria-label={showKey ? "Hide API key" : "Show API key"} aria-pressed={showKey}>
                                {showKey ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                            </Button>
                        </div>
                        <p id="ai-key-help" className="settings-field-help">Use a supported prefix and at least 12 characters. Provider and model are selected from the prefix; saving does not verify provider access.</p>
                    </section>

                    <section className="settings-section" aria-labelledby="ai-detected-title">
                        <h3 id="ai-detected-title">Detected provider and model</h3>
                        <div id="ai-detected" role="status">
                            {inferred ? <>
                                <dl className="settings-detected"><dt>Provider</dt><dd>{inferred.provider}</dd><dt>Model</dt><dd className="settings-value">{inferred.model}</dd></dl>
                                <a href={PROVIDER_DOCS[inferred.provider]} target="_blank" rel="noopener noreferrer" className="settings-link">Manage {inferred.provider} keys →</a>
                            </> : <p className="settings-note">{apiKey.trim() ? "Key prefix not recognized. Supported prefixes: AIza, sk-ant-, or sk-." : "Add a Gemini, Anthropic, or OpenAI key to detect your provider."}</p>}
                        </div>
                    </section>

                    <section className="settings-section" aria-labelledby="ai-storage-title">
                        <h3 id="ai-storage-title">Key use and storage</h3>
                        <p className="settings-note">Settings are saved for this browser tab in session storage, not local storage. Your key is sent to Gitvize’s server with analysis requests.</p>
                        {hasSavedSettings && <div className="settings-saved-state">
                            <Badge variant="secondary" className="text-xs">Saved for this tab</Badge>
                            <Button type="button" variant="ghost" size="sm" className="settings-clear" onClick={() => { clearAISettings(); setApiKey(""); }}>Clear saved key</Button>
                        </div>}
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!isValid}><Sparkles className="w-4 h-4" aria-hidden="true" />Save settings</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
