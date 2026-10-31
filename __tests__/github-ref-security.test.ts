/** @jest-environment node */
import { fetchAllRepoData } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
const SNAP_COMMIT = "a".repeat(40), SNAP_TREE = "c".repeat(40);
const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
});

it.each([
    "%2e%2e/%2e%2e/%2e%2e/%2e%2e/victim/private/git/trees/main",
    ".%2e/.%2e/.%2e/.%2e/victim/private/git/trees/main",
    "feature/api&per_page=1#fragment",
    "feature/正常",
])("keeps metadata branch %s inside the authorized repository and query", async branch => {
    process.env.GITHUB_TOKEN = "server-test-only";
    const urls: URL[] = [];
    global.fetch = jest.fn(async input => {
        const url = new URL(String(input));
        urls.push(url);
        if (url.pathname === "/repos/attacker/public") return Response.json({ private: false, default_branch: branch, topics: [] });
        if (url.pathname.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha: SNAP_COMMIT } });
        if (url.pathname.includes("/git/commits/")) return Response.json({ sha: SNAP_COMMIT, tree: { sha: SNAP_TREE } });
        if (url.pathname.includes("/git/trees/")) return Response.json({ sha: SNAP_TREE, tree: [] });
        if (url.pathname.endsWith("/languages")) return Response.json({});
        if (url.hostname === "raw.githubusercontent.com" || url.pathname.endsWith("/readme")) return new Response("Not found", { status: 404 });
        return Response.json([]);
    }) as typeof fetch;

    await fetchAllRepoData("attacker", "public");
    const tree = urls.find(url => url.pathname.includes("/git/trees/"))!;
    expect(tree.pathname).toBe(`/repos/attacker/public/git/trees/${SNAP_TREE}`);
    expect(urls.find(url => url.pathname.includes("/git/ref/"))?.pathname).toBe(`/repos/attacker/public/git/ref/heads/${encodeURIComponent(branch)}`);
    for (const url of urls.filter(url => url.pathname.endsWith("/commits"))) {
        expect(url.searchParams.get("sha")).toBe(SNAP_COMMIT);
        expect(url.searchParams.get("per_page")).toBe("100");
        expect(url.hash).toBe("");
    }
});
