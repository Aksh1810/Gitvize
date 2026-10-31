/** @jest-environment node */

import { fetchAllRepoData } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

it("rejects unavailable file trees rather than returning a successful empty workspace", async () => {
    const SNAP_COMMIT = "a".repeat(40), SNAP_TREE = "c".repeat(40);
const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input) => {
        const url = String(input);
        if (url.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha: SNAP_COMMIT } });
        if (url.includes("/git/commits/")) return Response.json({ sha: SNAP_COMMIT, tree: { sha: SNAP_TREE } });
        if (url.includes("/git/trees/")) return new Response("Service unavailable", { status: 503 });
        if (url.endsWith("/repos/example/loading-test")) {
            return Response.json({ private: false, default_branch: "main", topics: [] });
        }
        if (url.includes("raw.githubusercontent.com") || url.endsWith("/readme")) return new Response("Not found", { status: 404 });
        return Response.json([]);
    }) as typeof fetch;
    try {
        await expect(fetchAllRepoData("example", "loading-test")).rejects.toThrow("GitHub API error 503");
    } finally {
        global.fetch = originalFetch;
    }
});
