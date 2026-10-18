/** @jest-environment node */
import { fetchAllRepoData, fetchCommits } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const commit = { sha: "abc", commit: { message: "Change", author: { name: "Test", date: "2026-01-01T00:00:00Z" } }, parents: [] };

function mockRepository(failedPages: number[], empty = false, failBranch = false) {
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/commits")) {
            if (failedPages.includes(Number(url.searchParams.get("page"))) || (failBranch && url.searchParams.get("sha") === "feature-head")) {
                return new Response("Unavailable", { status: 503 });
            }
            return Response.json(empty || url.searchParams.get("page") !== "1" ? [] : [commit]);
        }
        if (url.pathname.endsWith("/branches")) return Response.json(failBranch ? [{ name: "feature", commit: { sha: "feature-head" } }] : []);
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: "tree", tree: [] });
        if (url.pathname.endsWith("/readme") || url.hostname === "raw.githubusercontent.com") return new Response("Not found", { status: 404 });
        if (url.pathname === "/repos/example/history") return Response.json({ private: false, default_branch: "main", topics: [] });
        return Response.json([]);
    }) as typeof fetch;
}

it.each([[1, 2, 3, 4, 5], [2]].map(failedPages => ({ failedPages })))("rejects failed pages in a direct history read", async ({ failedPages }) => {
    mockRepository(failedPages);
    await expect(fetchCommits("example", "history")).rejects.toThrow("503");
});
it("marks a complete history outage without losing the workspace", async () => {
    mockRepository([1, 2, 3, 4, 5]);
    const result = await fetchAllRepoData("example", "history", "test-only");
    expect(result.commits).toEqual([]);
    expect(result.commitsFetchError).toBe(true);
    expect(result.fileTree).toMatchObject({ sha: "tree" });
});
it("retains successful commit pages while marking history incomplete", async () => {
    mockRepository([2]);
    const result = await fetchAllRepoData("example", "history", "test-only");
    expect(result.commits.map(c => c.sha)).toEqual(["abc"]);
    expect(result.commitsFetchError).toBe(true);
});
it("marks failed extra-branch history incomplete", async () => {
    mockRepository([], false, true);
    const result = await fetchAllRepoData("example", "history", "test-only");
    expect(result.commits.map(c => c.sha)).toEqual(["abc"]);
    expect(result.commitsFetchError).toBe(true);
});
it("distinguishes a successful empty history from a failure", async () => {
    mockRepository([], true);
    const result = await fetchAllRepoData("example", "history", "test-only");
    expect(result.commits).toEqual([]);
    expect(result.commitsFetchError).toBe(false);
});
