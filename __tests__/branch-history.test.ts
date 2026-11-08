import { createBranchHistory, historyCommits, mergeHistoryPage } from "@/lib/branch-history";
import type { Commit, CommitHistoryPage } from "@/types";
const head = "a".repeat(40);
const commit = (sha: string): Commit => ({ sha, shortSha: sha.slice(0, 7), message: sha, authorName: "Fixture", authorLogin: null, authorAvatar: null, date: "2026-11-07T00:00:00Z", parents: [] });
const page = (n: number, next: number | null = n + 1, shas = [`page-${n}`]): CommitHistoryPage => ({ status: "ready", headSha: head, page: n, perPage: 100, commits: shas.map(commit), nextPage: next });
it("repairs page 2 without discarding pages 3–5, advancing to page 6 only after the gap closes", () => {
    const history = createBranchHistory("main", head, { 1: page(1), 2: { status: "error", page: 2, perPage: 100, error: { status: 503, message: "Temporary outage" } }, 3: page(3), 4: page(4), 5: page(5) });
    expect(history.nextPage).toBe(2); expect(history.complete).toBe(false);
    expect(historyCommits(history).map(c => c.sha)).toEqual(["page-1", "page-3", "page-4", "page-5"]);
    const fixed = mergeHistoryPage(history, page(2));
    expect(fixed.nextPage).toBe(6); expect(fixed.error).toBeNull();
    expect(historyCommits(fixed).map(c => c.sha)).toEqual(["page-1", "page-2", "page-3", "page-4", "page-5"]);
});
it("preserves page/API order and merges duplicate SHAs without counting graph extras", () => {
    const history = createBranchHistory("feature", head, { 1: page(1, 2, ["tip", "shared"]), 2: page(2, null, ["shared", "root"]) });
    expect(historyCommits(history).map(c => c.sha)).toEqual(["tip", "shared", "root"]);
    expect(history).toMatchObject({ complete: true, nextPage: null, cutoff: false });
});
it("keeps repeated failures retryable and only a valid terminal page establishes completion", () => {
    const initial = createBranchHistory("main", head, { 1: page(1) });
    const failed = mergeHistoryPage(initial, { status: "error", page: 2, perPage: 100, error: { status: 429, message: "Retry later", retryAfter: 60 } });
    expect(mergeHistoryPage(failed, failed.pages[2])).toMatchObject({ nextPage: 2, complete: false, error: { status: 429 } });
    expect(historyCommits(failed).map(c => c.sha)).toEqual(["page-1"]);
    expect(mergeHistoryPage(failed, page(2, null, []))).toMatchObject({ nextPage: null, complete: true, error: null });
});
it("marks the history ceiling as a cutoff rather than completion", () => {
    const pages = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, page(i + 1)]));
    expect(createBranchHistory("main", head, pages)).toMatchObject({ nextPage: null, cutoff: true, complete: false });
});
it("rejects a page belonging to a different captured head or page size", () => {
    const history = createBranchHistory("main", head);
    expect(() => mergeHistoryPage(history, { ...page(1), headSha: "b".repeat(40) })).toThrow(/match/);
    expect(() => mergeHistoryPage(history, { ...page(1), perPage: 50 })).toThrow(/match/);
});
it("does not use a later terminal page to declare completion across an earlier gap", () => {
    const history = createBranchHistory("main", head, { 1: page(1), 2: { status: "error", page: 2, perPage: 100, error: { status: 503, message: "Retry" } }, 3: page(3, null, []) });
    expect(history).toMatchObject({ nextPage: 2, complete: false });
    expect(mergeHistoryPage(history, page(2))).toMatchObject({ nextPage: null, complete: true });
});
