/** @jest-environment node */
import { buildAnalysisRequest, resolveAnalysisResponse } from "@/lib/analysis-client";
import { spawnSync } from "node:child_process";

jest.mock("mermaid", () => ({ __esModule: true, default: { parse: jest.fn(async (code: string) => code.includes("broken") ? false : { diagramType: "flowchart-v2" }) } }));
const architecture = { techStack: [], architecturePattern: "Modular", description: "Provider details", modules: [], entryPoints: [], dataFlow: [], mermaidDiagram: "flowchart TB\nA-->B" };

it("omits irrelevant Smart secrets/README and strips non-analysis tree fields", () => {
    const result = buildAnalysisRequest({ owner: "example", repo: "repo", mode: "smart", tree: [{ path: "file.ts", type: "blob", sha: "blob", url: "unused URL", mode: "100644" }], readme: "x".repeat(50_001), aiSettings: { provider: "openai", apiKey: "caller-test-only", model: "model" } });
    expect(JSON.parse(result.body)).toEqual({ owner: "example", repo: "repo", mode: "smart", tree: [{ path: "file.ts", type: "blob" }] });
    expect(result.sampled).toBe(false);
});

it("bounds Premium excerpts and includes a visible truncation signal", () => {
    const result = buildAnalysisRequest({ owner: "example", repo: "repo", mode: "premium", tree: [], readme: "é".repeat(50_001) });
    expect(JSON.parse(result.body)).toMatchObject({ readme: "é".repeat(50_000), readmeTruncated: true });
    expect(result.readmeTruncated).toBe(true);
});

it("fits UTF-8 request bytes by retaining an explicitly reported prefix of selected items", () => {
    const tree = Array.from({ length: 500 }, (_, i) => ({ path: `${i}/` + "é".repeat(4090), type: "blob" as const }));
    const result = buildAnalysisRequest({ owner: "example", repo: "repo", mode: "smart", tree });
    expect(Buffer.byteLength(result.body, "utf8")).toBeLessThanOrEqual(2 * 1024 * 1024);
    const sent = JSON.parse(result.body).tree;
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(500);
    expect(sent[0].path).toBe(tree[0].path);
    expect(result.selectedCount).toBe(sent.length);
    expect(result.sampled).toBe(true);
});

it("rejects an unsendable fixed payload instead of submitting oversized data", () => {
    expect(() => buildAnalysisRequest({ owner: "example", repo: "repo", mode: "premium", tree: [], aiSettings: { provider: "openai", apiKey: "x".repeat(2 * 1024 * 1024) } })).toThrow();
});

it.each([{}, { source: "ai", metadataSource: "ai", architecture, annotations: [] }, { source: "pending", metadataSource: "unknown", architecture, annotations: [] }, { source: "pending", metadataSource: "ai", architecture: { ...architecture, modules: "bad" }, annotations: [] }])("rejects ambiguous or malformed result provenance: %j", async value => {
    await expect(resolveAnalysisResponse(value)).rejects.toThrow();
});

it("promotes only a parsed provider candidate while retaining independent metadata provenance", async () => {
    await expect(resolveAnalysisResponse({ source: "pending", metadataSource: "deterministic", architecture, annotations: [] })).resolves.toMatchObject({ source: "ai", metadataSource: "deterministic" });
});

it("turns unparseable AI syntax into diagram fallback without inventing deterministic metadata", async () => {
    const result = await resolveAnalysisResponse({ source: "pending", metadataSource: "ai", architecture: { ...architecture, mermaidDiagram: "flowchart TB\nA[broken" }, annotations: [] });
    expect(result).toMatchObject({ source: "fallback", metadataSource: "ai" });
    expect(result.architecture.mermaidDiagram).toBeUndefined();
});

it("rejects oversized diagram bytes before promoting a provider candidate", async () => {
    const result = await resolveAnalysisResponse({ source: "pending", metadataSource: "ai", architecture: { ...architecture, mermaidDiagram: "flowchart TB\n%%" + "é".repeat(33_000) }, annotations: [] });
    expect(result.source).toBe("fallback");
});

it("uses the installed Mermaid parser with real browser DOM semantics without running callbacks", () => {
    const script = `
        import { JSDOM } from 'jsdom';
        const dom = new JSDOM('');
        globalThis.window = dom.window;
        globalThis.document = dom.window.document;
        globalThis.callbackRan = false;
        globalThis.dangerousCallback = () => { globalThis.callbackRan = true; };
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({startOnLoad:false, securityLevel:'strict', flowchart:{htmlLabels:false}});
        const valid = await mermaid.parse('flowchart TB\\nA["File"] --> B["Service"]\\nclick A dangerousCallback', {suppressErrors:true});
        const invalid = await mermaid.parse('flowchart TB\\nA[broken', {suppressErrors:true});
        console.log(JSON.stringify({ valid: Boolean(valid), invalid, callbackRan: globalThis.callbackRan }));
        dom.window.close();
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout.trim())).toEqual({ valid: true, invalid: false, callbackRan: false });
});
