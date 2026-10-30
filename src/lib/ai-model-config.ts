/** Provider contracts checked against official API documentation on 2026-10-30. */
export type AIProvider = "openai" | "anthropic" | "gemini";
export type AnalysisStage = "diagram" | "metadata";

export interface AISettings {
    provider: AIProvider;
    apiKey: string;
    model: string;
}

export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
    openai: "gpt-4o-mini",
    anthropic: "claude-sonnet-4-6",
    gemini: "gemini-2.5-flash",
};

// GPT-4o and mini are deprecated, with API shutdown scheduled for 2027-01-14.
// They remain callable; do not migrate a user's explicit choice prematurely.
const outputLimits: Record<AIProvider, Record<string, number>> = {
    openai: {
        "gpt-4o-mini": 16_384,
        "gpt-4o-mini-2024-07-18": 16_384,
        "gpt-4o": 16_384,
        "gpt-4o-2024-08-06": 16_384,
        "gpt-4o-2024-11-20": 16_384,
    },
    anthropic: { "claude-sonnet-4-6": 128_000 },
    gemini: { "gemini-2.5-flash": 65_536 },
};
const stageBudgets: Record<AnalysisStage, number> = { diagram: 4096, metadata: 2048 };

export class AIModelConfigurationError extends Error {
    constructor() {
        super("The selected AI model is unsupported or retired. Choose a supported model in AI settings or update AI_MODEL.");
    }
}

export function isAIProvider(value: unknown): value is AIProvider {
    return value === "openai" || value === "anthropic" || value === "gemini";
}

export function getDefaultAIModel(provider: string): string {
    if (!isAIProvider(provider)) throw new AIModelConfigurationError();
    return DEFAULT_AI_MODELS[provider];
}

export function getStageOutputTokens(provider: string, model: string, stage: AnalysisStage): number {
    const limit = isAIProvider(provider) ? outputLimits[provider][model] : undefined;
    if (typeof limit !== "number") throw new AIModelConfigurationError();
    return Math.min(stageBudgets[stage], limit);
}

/** Key syntax suggests a provider; supported model capabilities come from the registry. */
export function inferAIProvider(apiKey: string): AIProvider | null {
    const key = apiKey.trim();
    if (key.startsWith("AIza")) return "gemini";
    if (key.startsWith("sk-ant-")) return "anthropic";
    if (key.startsWith("sk-")) return "openai";
    return null;
}

export function migrateSavedAISettings(value: unknown): { settings: AISettings; previousModel?: string } | null {
    if (!value || typeof value !== "object") return null;
    const saved = value as Record<string, unknown>;
    if (!isAIProvider(saved.provider) || typeof saved.apiKey !== "string" || !saved.apiKey.trim() || typeof saved.model !== "string" || !saved.model.trim()) return null;
    const settings: AISettings = { provider: saved.provider, apiKey: saved.apiKey, model: saved.model };
    const retiredDefault = (settings.provider === "anthropic" && settings.model === "claude-3-5-sonnet-20241022")
        || (settings.provider === "gemini" && settings.model === "gemini-2.0-flash");
    return retiredDefault
        ? { settings: { ...settings, model: getDefaultAIModel(settings.provider) }, previousModel: settings.model }
        : { settings };
}
