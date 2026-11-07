/** @jest-environment node */

import { fetchFileContent } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

const originalFetch = global.fetch;
const snapshot = (repo: string) => ({ schemaVersion: 1 as const, owner: "example", repo, selectedBranch: "main", defaultBranch: "main", status: "ready" as const, commitSha: "a".repeat(40), treeSha: "c".repeat(40), visibility: "private" as const, capturedAt: "2026-11-07T12:00:00.000Z" });
const read = (repo: string, path: string, token: string) => fetchFileContent("example", repo, path, token, snapshot(repo));

afterEach(() => {
    global.fetch = originalFetch;
});

it.each([
    ["fine-grained-prefix", "github_pat_victim-test-only", "github_p"],
    ["fine-grained-token", "github_pat_victim-test-only", "github_pat_forged-test-only"],
    ["classic-prefix", "ghp_abcd-victim-test-only", "ghp_abcd-forged-test-only"],
])("does not disclose a cached private file to another credential (%s)", async (repo, victim, attacker) => {
    global.fetch = jest.fn(async (input, init) => {
        // Both credentials can see metadata; only the victim can read contents.
        if (/^\/repos\/example\/[^/]+$/.test(new URL(String(input)).pathname)) return Response.json({ private: true });
        if (String(input).includes("/git/commits/")) return Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } });
        if (new Headers(init?.headers).get("Authorization") === `token ${victim}`) {
            return Response.json({ type: "file", encoding: "base64", content: Buffer.from("private source").toString("base64") });
        }
        return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    await expect(read(repo, "private.ts", victim)).resolves.toBe("private source");
    await expect(read(repo, "private.ts", attacker)).rejects.toMatchObject({ status: 404 });
});

it("rechecks private Contents permission for the same complete credential instead of reusing old bytes", async () => {
    global.fetch = jest.fn(async (input) => String(input).includes("/git/commits/") ? Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } }) : /^\/repos\/example\/[^/]+$/.test(new URL(String(input)).pathname)
        ? Response.json({ private: true })
        : Response.json({ type: "file", encoding: "base64", content: Buffer.from("cached source").toString("base64") })) as typeof fetch;
    await expect(read("repeat-read", "index.ts", "github_pat_test-only")).resolves.toBe("cached source");

    global.fetch = jest.fn(async (input) => String(input).includes("/git/commits/") ? Response.json({ sha: "a".repeat(40), tree: { sha: "c".repeat(40) } }) : /^\/repos\/example\/[^/]+$/.test(new URL(String(input)).pathname)
        ? Response.json({ private: true })
        : new Response("Forbidden", { status: 403 })) as typeof fetch;
    await expect(read("repeat-read", "index.ts", "github_pat_test-only")).rejects.toMatchObject({ status: 403 });
});
