// ============================================================================
// GitViz — AI Credit Tracking (localStorage-based, per-user)
// ============================================================================
// Gemini 2.0 Flash free tier: 15 RPM, 1500 RPD, 1M TPM
// We track daily usage and enforce a generous per-user daily cap.

const STORAGE_KEY = "gitviz_ai_credits";
const DAILY_LIMIT = 30; // generous daily cap per user (each repo = ~3 API calls)

interface CreditState {
    date: string;       // ISO date string (YYYY-MM-DD)
    used: number;       // requests used today
    repos: string[];    // repos analyzed today (for display)
}

function today(): string {
    return new Date().toISOString().split("T")[0];
}

function getState(): CreditState {
    if (typeof window === "undefined") return { date: today(), used: 0, repos: [] };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { date: today(), used: 0, repos: [] };
        const state: CreditState = JSON.parse(raw);
        // Reset if it's a new day
        if (state.date !== today()) {
            return { date: today(), used: 0, repos: [] };
        }
        return state;
    } catch {
        return { date: today(), used: 0, repos: [] };
    }
}

function saveState(state: CreditState): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Check if the user has credits remaining today */
export function hasCreditsRemaining(): boolean {
    return getState().used < DAILY_LIMIT;
}

/** Get current credit usage info */
export function getCreditInfo(): { used: number; limit: number; remaining: number; repos: string[] } {
    const state = getState();
    return {
        used: state.used,
        limit: DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - state.used),
        repos: state.repos,
    };
}

/** Record that N credits were used for a repo analysis */
export function recordUsage(repoFullName: string, count: number = 3): void {
    const state = getState();
    state.used += count;
    if (!state.repos.includes(repoFullName)) {
        state.repos.push(repoFullName);
    }
    saveState(state);
}
