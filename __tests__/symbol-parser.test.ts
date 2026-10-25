/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildSymbolGraph } from "@/lib/symbol-parser";

it("preserves methods, modifiers and references without truncating modifier-like names", () => {
    const graph = buildSymbolGraph([
        { path: "base.ts", content: "export class Base {}" },
        { path: "example.ts", content: `
import { Base } from './base';
class Example extends Base {
    constructor() {}
    run() {}
    public static async execute() {}
    get status() {}
    set status(next) {}
    public /* modifier separator */ readonly inspect() {}
    protected
    multiline() {}
publicMethod() {}
}` },
    ]);

    expect(graph.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.name))
        .toEqual(["run", "execute", "status", "inspect", "multiline", "publicMethod"]);
    expect(graph.symbols.some((symbol) => symbol.name === "constructor")).toBe(false);
    expect(graph.references).toEqual(expect.arrayContaining([
        expect.objectContaining({ fromFilePath: "example.ts", toFilePath: "base.ts", relation: "extends" }),
    ]));
});

it.each([
    ["spaces", " ".repeat(10_000) + "\n!"],
    ["tabs and CRLF", "\t".repeat(10_000) + "\r\n!"],
    ["modifier prefix", "public ".repeat(1_000) + "!"],
])("bounds parsing of hostile %s", (_label, content) => {
    const compiled = ts.transpileModule(readFileSync("src/lib/symbol-parser.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    // A child-process deadline can interrupt a stuck regex; a Jest timeout cannot.
    const result = spawnSync(process.execPath, ["-e", `
        const mod = { exports: {} };
        new Function('exports', 'module', ${JSON.stringify(compiled)})(mod.exports, mod);
        const graph = mod.exports.buildSymbolGraph([{ path: 'src/index.ts', content: ${JSON.stringify(content)} }]);
        if (graph.symbols.length || graph.references.length) process.exit(1);
    `], { timeout: 2_000, encoding: "utf8" });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
});
