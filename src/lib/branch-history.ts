import { z } from "zod";
import { gitShaSchema } from "@/lib/repository-snapshot";
import type { BranchHistory, Commit, CommitHistoryPage, HistoryPageResult } from "@/types";

export const MAX_HISTORY_PAGES = 50;
export const MAX_LOAD_ALL_REQUESTS = 10;
export const HISTORY_PAGE_SIZE = 100;
const commitSchema = z.object({
    sha: z.string().min(1), shortSha: z.string(), message: z.string(), authorName: z.string(),
    authorLogin: z.string().nullable(), authorAvatar: z.string().nullable(), date: z.string(),
    authorEmail: z.string().optional(), branch: z.string().optional(), parents: z.array(z.string()).optional(),
});
export const commitHistoryPageSchema: z.ZodType<CommitHistoryPage> = z.object({
    status: z.literal("ready"), headSha: gitShaSchema,
    page: z.number().int().min(1).max(MAX_HISTORY_PAGES), perPage: z.number().int().min(1).max(HISTORY_PAGE_SIZE),
    commits: z.array(commitSchema).max(HISTORY_PAGE_SIZE), nextPage: z.number().int().min(2).max(MAX_HISTORY_PAGES + 1).nullable(),
}).refine(value => value.commits.length <= value.perPage && (value.nextPage === null || value.nextPage === value.page + 1));

/** Only contiguous successful pages establish continuation/completion; later pages remain available. */
export function createBranchHistory(branch: string, headSha: string | null, pages: Record<number, HistoryPageResult> = {}, perPage = HISTORY_PAGE_SIZE): BranchHistory {
    const history: BranchHistory = { branch, headSha, pages, perPage, nextPage: headSha ? 1 : null, complete: !headSha, cutoff: false, error: null };
    if (!headSha) return history;
    for (let page = 1; page <= MAX_HISTORY_PAGES; page++) {
        const result = pages[page];
        if (!result || result.status === "error") {
            history.nextPage = page;
            history.error = result?.status === "error" ? result.error : null;
            return history;
        }
        if (result.nextPage === null) return { ...history, nextPage: null, complete: true };
    }
    return { ...history, nextPage: null, cutoff: true };
}

export function mergeHistoryPage(history: BranchHistory, result: HistoryPageResult): BranchHistory {
    if (result.perPage !== history.perPage || (result.status === "ready" && result.headSha !== history.headSha)) throw new Error("History page does not match the captured branch.");
    return createBranchHistory(history.branch, history.headSha, { ...history.pages, [result.page]: result }, history.perPage);
}

export function historyCommits(history: BranchHistory): Commit[] {
    const seen = new Set<string>(), commits: Commit[] = [];
    const pages = Object.values(history.pages).sort((a, b) => a.page - b.page);
    const end = pages.find(page => page.status === "ready" && page.nextPage === null)?.page ?? MAX_HISTORY_PAGES;
    for (const page of pages) {
        if (page.status !== "ready" || page.page > end) continue;
        for (const commit of page.commits) if (!seen.has(commit.sha)) { seen.add(commit.sha); commits.push(commit); }
    }
    return commits;
}
