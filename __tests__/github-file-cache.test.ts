/** @jest-environment node */

import { fetchFileContent } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

const originalFetch = global.fetch;

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
        if (new Headers(init?.headers).get("Authorization") === `token ${victim}`) {
            return Response.json({ type: "file", encoding: "base64", content: Buffer.from("private source").toString("base64") });
        }
        return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    await expect(fetchFileContent("example", repo, "private.ts", victim)).resolves.toBe("private source");
    await expect(fetchFileContent("example", repo, "private.ts", attacker)).rejects.toThrow("File not found");
});

it("preserves cached reads for the same complete credential", async () => {
    global.fetch = jest.fn(async () => Response.json({
        type: "file", encoding: "base64", content: Buffer.from("cached source").toString("base64"),
    })) as typeof fetch;
    await expect(fetchFileContent("example", "repeat-read", "index.ts", "github_pat_test-only")).resolves.toBe("cached source");

    global.fetch = jest.fn(async (input) => /^\/repos\/example\/[^/]+$/.test(new URL(String(input)).pathname)
        ? Response.json({ private: true })
        : new Response("Unavailable", { status: 503 })) as typeof fetch;
    await expect(fetchFileContent("example", "repeat-read", "index.ts", "github_pat_test-only")).resolves.toBe("cached source");
});
