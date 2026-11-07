import { cacheDiagram, getCachedDiagram } from "@/lib/diagram-cache";
import type { ArchitectureAnalysis, RepositorySnapshot } from "@/types";
const A = "a".repeat(40), B = "b".repeat(40), T = "c".repeat(40);
const snapshot: RepositorySnapshot = { schemaVersion: 1, owner: "example", repo: "repo", selectedBranch: "main", defaultBranch: "main", status: "ready", commitSha: A, treeSha: T, visibility: "public", capturedAt: "2026-11-07T12:00:00.000Z" };
const architecture: ArchitectureAnalysis = { techStack: [], architecturePattern: "Modular", description: "Verified fixture", modules: [], entryPoints: [], dataFlow: [], mermaidDiagram: "flowchart TB\nA-->B" };
const opts = { snapshot, mode: "premium" as const, provider: "openai", model: "gpt-4o-mini" };
const write = (options = opts) => cacheDiagram("example", "repo", { architecture, annotations: [] }, "ai", options);
beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); jest.setSystemTime(new Date("2026-11-07T12:00:00Z")); });
afterEach(() => { jest.useRealTimers(); });
it("separates commit, mode and provider/model while preserving same-identity reuse", () => {
    write(); expect(getCachedDiagram("example", "repo", opts)?.architecture.description).toBe("Verified fixture");
    expect(getCachedDiagram("example", "repo", { ...opts, snapshot: { ...snapshot, commitSha: B } })).toBeNull();
    expect(getCachedDiagram("example", "repo", { ...opts, mode: "smart" })).toBeNull();
    expect(getCachedDiagram("example", "repo", { ...opts, model: "another-model" })).toBeNull();
    expect(getCachedDiagram("example", "repo", { ...opts, provider: "claude" })).toBeNull();
});
it("expires public data after 24 hours without clearing unrelated storage", () => {
    localStorage.setItem("unrelated-preference", "keep"); write();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCachedDiagram("example", "repo", opts)).toBeNull(); expect(localStorage.getItem("unrelated-preference")).toBe("keep");
});
it("never persists or reuses private diagrams across sessions/credentials", () => {
    const privateOpts = { ...opts, snapshot: { ...snapshot, visibility: "private" as const } };
    write(privateOpts); expect(localStorage.length).toBe(0);
    expect(getCachedDiagram("example", "repo", privateOpts)).toBeNull();
});
it("ignores revisionless legacy data and malformed/version-mismatched entries", () => {
    localStorage.setItem("unrelated", "keep");
    localStorage.setItem("gitviz_diagram_cache:example/repo|anon|premium", JSON.stringify({ architecture, annotations: [], source: "ai", cachedAt: new Date().toISOString() }));
    expect(getCachedDiagram("example", "repo", opts)).toBeNull();
    expect(localStorage.getItem("gitviz_diagram_cache:example/repo|anon|premium")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    localStorage.clear(); write();
    const key = localStorage.key(0)!; const entry = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...entry, schemaVersion: 999 }));
    expect(getCachedDiagram("example", "repo", opts)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ ...entry, architecture: { description: "invalid" } }));
    expect(getCachedDiagram("example", "repo", opts)).toBeNull();
});
it("evicts only the oldest public diagrams over the 20-entry bound", () => {
    localStorage.setItem("unrelated", "keep");
    for (let i = 0; i < 21; i++) { write({ ...opts, snapshot: { ...snapshot, commitSha: i.toString(16).padStart(40, "0") } }); jest.advanceTimersByTime(1); }
    expect(localStorage.length).toBe(21);
    expect(getCachedDiagram("example", "repo", { ...opts, snapshot: { ...snapshot, commitSha: "0".repeat(40) } })).toBeNull();
    expect(getCachedDiagram("example", "repo", { ...opts, snapshot: { ...snapshot, commitSha: (20).toString(16).padStart(40, "0") } })).not.toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
});
it.each(["schemaVersion", "generatorVersion", "promptVersion"])("rejects incompatible %s instead of treating it as fresh", field => {
    write(); const key = localStorage.key(0)!; const entry = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...entry, [field]: 999 }));
    expect(getCachedDiagram("example", "repo", opts)).toBeNull();
});
it("does not persist a diagram without a known Premium provider/model or valid repository snapshot", () => {
    cacheDiagram("example", "repo", { architecture, annotations: [] }, "ai", { snapshot, mode: "premium" });
    cacheDiagram("other", "repo", { architecture, annotations: [] }, "ai", opts);
    expect(localStorage.length).toBe(0);
});
