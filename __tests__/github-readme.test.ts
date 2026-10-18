/** @jest-environment node */

import { fetchReadme } from "@/lib/github";

jest.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

it.each(["Hello World!\n", "# café 🚀\n日本語 — नमस्ते\n"])(
    "preserves README text: %s", async text => {
        // GitHub may wrap base64 content across lines.
        const content = Buffer.from(text, "utf-8").toString("base64").match(/.{1,16}/g)!.join("\n");
        global.fetch = jest.fn(async () => Response.json({ content, encoding: "base64" })) as typeof fetch;
        await expect(fetchReadme("example", "repo")).resolves.toBe(text);
    },
);

it("keeps a missing README optional", async () => {
    global.fetch = jest.fn(async () => new Response("Not found", { status: 404 })) as typeof fetch;
    await expect(fetchReadme("example", "repo")).resolves.toBe("");
});
