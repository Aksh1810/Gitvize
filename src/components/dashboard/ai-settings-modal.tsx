"use client";

import { useState, useEffect } from "react";
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
import { Check, Eye, EyeOff, Sparkles } from "lucide-react";

export interface AISettings {
    provider: "openai" | "anthropic" | "gemini";
    apiKey: string;
    model: string;
}

const PROVIDERS = [
    {
        id: "openai" as const,
        name: "OpenAI",
        description: "GPT-4o, GPT-4o-mini",
        defaultModel: "gpt-4o-mini",
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1-nano"],
        keyPrefix: "sk-",
        keyPlaceholder: "sk-...",
        docsUrl: "https://platform.openai.com/api-keys",
    },
    {
        id: "anthropic" as const,
        name: "Anthropic",
        description: "Claude 3.5 Sonnet, Haiku",
        defaultModel: "claude-3-5-sonnet-20241022",
        models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
        keyPrefix: "sk-ant-",
        keyPlaceholder: "sk-ant-...",
        docsUrl: "https://console.anthropic.com/settings/keys",
    },
    {
        id: "gemini" as const,
        name: "Google Gemini",
        description: "Gemini 2.0 Flash, Pro",
        defaultModel: "gemini-2.0-flash",
        models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
        keyPrefix: "AI",
        keyPlaceholder: "AIza...",
        docsUrl: "https://aistudio.google.com/app/apikey",
    },
];

const STORAGE_KEY = "gitviz_ai_settings";

export function loadAISettings(): AISettings | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as AISettings;
    } catch {
        return null;
    }
}

export function saveAISettings(settings: AISettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearAISettings() {
    localStorage.removeItem(STORAGE_KEY);
}

interface AISettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (settings: AISettings) => void;
}

export default function AISettingsModal({ open, onOpenChange, onSave }: AISettingsModalProps) {
    const [provider, setProvider] = useState<AISettings["provider"]>("openai");
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState("gpt-4o-mini");
    const [showKey, setShowKey] = useState(false);

    // Load saved settings on mount
    useEffect(() => {
        const saved = loadAISettings();
        if (saved) {
            setProvider(saved.provider);
            setApiKey(saved.apiKey);
            setModel(saved.model);
        }
    }, [open]);

    const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

    const handleProviderChange = (id: AISettings["provider"]) => {
        setProvider(id);
        const prov = PROVIDERS.find((p) => p.id === id)!;
        setModel(prov.defaultModel);
    };

    const handleSave = () => {
        const settings: AISettings = { provider, apiKey, model };
        saveAISettings(settings);
        onSave(settings);
        onOpenChange(false);
    };

    const isValid = apiKey.length > 10;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-card border-border/50 sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                        AI Settings
                    </DialogTitle>
                    <DialogDescription>
                        Choose your LLM provider and enter your API key to generate intelligent architecture diagrams.
                        Your key is stored locally in your browser only.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Provider Selection */}
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Provider
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                            {PROVIDERS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleProviderChange(p.id)}
                                    className={`relative rounded-lg border p-3 text-left transition-all hover:bg-secondary/30 ${provider === p.id
                                            ? "border-indigo-500/50 bg-indigo-500/10"
                                            : "border-border/40 bg-secondary/10"
                                        }`}
                                >
                                    {provider === p.id && (
                                        <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-indigo-400" />
                                    )}
                                    <div className="text-sm font-semibold text-foreground">{p.name}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{p.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* API Key */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                API Key
                            </Label>
                            <a
                                href={selectedProvider.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-400 hover:underline"
                            >
                                Get a key →
                            </a>
                        </div>
                        <div className="relative">
                            <Input
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={selectedProvider.keyPlaceholder}
                                className="pr-10 bg-secondary/20 border-border/40 font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Model
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {selectedProvider.models.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setModel(m)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${model === m
                                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                            : "bg-secondary/20 text-muted-foreground border border-border/30 hover:bg-secondary/40"
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Status */}
                    {loadAISettings() && (
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
