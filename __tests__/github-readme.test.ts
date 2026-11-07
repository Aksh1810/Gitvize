/** @jest-environment node */

import { authorizeRepositoryRead, fetchReadme } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

const originalFetch = global.fetch;
const snapshot = { schemaVersion: 1 as const, owner: "example", repo: "repo", selectedBranch: "main", defaultBranch: "main", status: "ready" as const, commitSha: "a".repeat(40), treeSha: "c".repeat(40), visibility: "public" as const, capturedAt: "2026-11-07T12:00:00.000Z" };
afterEach(() => { global.fetch = originalFetch; });

it.each(["Hello World!\n", "# café 🚀\n日本語 — नमस्ते\n"])(
    "preserves README text: %s", async text => {
        // GitHub may wrap base64 content across lines.
        const content = Buffer.from(text, "utf-8").toString("base64").match(/.{1,16}/g)!.join("\n");
        global.fetch = jest.fn(async input => String(input).includes("/git/commits/") ? Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } }) : new URL(String(input)).pathname === "/repos/example/repo" ? Response.json({ private: false }) : Response.json({ type: "file", content, encoding: "base64" })) as typeof fetch;
        await expect(fetchReadme(await authorizeRepositoryRead("example", "repo"), snapshot)).resolves.toBe(text);
    },
);

it("keeps a missing README optional", async () => {
    global.fetch = jest.fn(async input => String(input).includes("/git/commits/") ? Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } }) : new URL(String(input)).pathname === "/repos/example/repo" ? Response.json({ private: false }) : String(input).includes("/git/commits/") ? Response.json({ sha: snapshot.commitSha, tree: { sha: snapshot.treeSha } }) : new Response("Not found", { status: 404 })) as typeof fetch;
    await expect(fetchReadme(await authorizeRepositoryRead("example", "repo"), snapshot)).resolves.toBe("");
});
