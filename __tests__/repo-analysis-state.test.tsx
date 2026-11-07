import { StrictMode, type ReactNode } from "react";
import { TextDecoder, TextEncoder } from "node:util";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RepoPageClient from "@/app/[owner]/[repo]/repo-page-client";
import { cacheDiagram, getCachedDiagram } from "@/lib/diagram-cache";
import { toast } from "sonner";
import mermaid from "mermaid";
import type { AISettings } from "@/lib/ai-model-config";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=architecture"), useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
jest.mock("@/components/dashboard/navbar", () => ({ __esModule: true, default: ({ onAISettings, onGithubToken }: { onAISettings: () => void; onGithubToken: () => void }) => <><button onClick={onAISettings}>Settings</button><button onClick={onGithubToken}>Token</button></> }));
jest.mock("@/components/dashboard/tab-nav", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/repo-onboarding-guide", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/clone-progress-screen", () => ({ __esModule: true, default: () => <p>Loading repository</p> }));
let mockSettings: AISettings | null;
jest.mock("@/components/dashboard/ai-settings-modal", () => ({ __esModule: true, loadAISettings: () => mockSettings, default: ({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (settings: AISettings) => void }) => open ? <button onClick={() => { onSave(mockSettings!); onOpenChange(false); }}>Save fixture settings</button> : null }));
jest.mock("@/components/dashboard/github-token-modal", () => ({ __esModule: true, consumeOneTimeGitHubToken: () => "", setOneTimeGitHubToken: jest.fn(), default: ({ open, onSave, onOpenChange }: { open: boolean; onSave: (token: string) => void; onOpenChange: (open: boolean) => void }) => open ? <button onClick={() => { onSave("dummy-new-github-context"); onOpenChange(false); }}>Save fixture token</button> : null }));
jest.mock("@/components/diagrams/file-tree-graph", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/branch-graph", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/contributors-network", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/dependency-graph", () => ({ __esModule: true, default: () => null }));
// Keep the page and Architecture state/callbacks real; replace only diagram generation/rendering.
jest.mock("@/lib/mermaid-generator", () => ({ generateArchitectureOverview: (tree: Array<{ path: string }>) => `Smart overview: ${tree[0]?.path}`, generateArchitectureMermaid: (analysis: { description: string }) => analysis.description }));
jest.mock("@/components/diagrams/mermaid-diagram", () => ({ __esModule: true, default: ({ code, onFallback, viewControls }: { code: string; onFallback?: () => void; viewControls?: ReactNode }) => <div>{viewControls}<pre aria-label="Rendered architecture">{code}</pre><button onClick={onFallback}>Renderer fallback</button></div> }));
jest.mock("mermaid", () => ({ __esModule: true, default: { parse: jest.fn(async () => ({ diagramType: "flowchart-v2" })), initialize: jest.fn(), render: jest.fn(async () => { throw new Error("Fixture renderer failure"); }) } }));
jest.mock("@/lib/diagram-cache", () => ({ hashToken: () => "anon", getCachedDiagram: jest.fn(), cacheDiagram: jest.fn() }));
jest.mock("sonner", () => ({ toast: { loading: jest.fn(() => "analysis-toast"), success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() } }));
Object.assign(globalThis, { TextDecoder, TextEncoder });

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function repository(repo = "repo", sha = "tree") { return { metadata: { owner: "example", repo, fullName: `example/${repo}`, description: "Repository", stars: 0, forks: 0, watchers: 0, openIssues: 0, license: null, topics: [], language: "TypeScript", pushedAt: "2026-10-29", defaultBranch: "main", htmlUrl: `https://github.com/example/${repo}` }, fileTree: { sha, truncated: false, tree: [{ path: `${repo}.ts`, type: "blob", mode: "100644", sha: "blob", url: "" }] }, contributors: [], branches: [], commits: [], readme: "", languages: {}, dependencyFiles: [], mergedPRs: [] }; }
function result(source = "smart", description = "Smart result") { return { architecture: { techStack: [], architecturePattern: "Modular", description, modules: [], entryPoints: [], dataFlow: [], mermaidDiagram: "flowchart TB\nA-->B" }, annotations: [], source, metadataSource: "deterministic" }; }
const json = (data: unknown) => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => data });
function stream(event: unknown) { let read = false; return { ok: true, status: 200, headers: new Headers({ "content-type": "text/event-stream" }), body: { getReader: () => ({ read: async (): Promise<{ done: boolean; value?: Uint8Array }> => read ? { done: true } : (read = true, { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`) }) }) } }; }
type ResponseFixture = ReturnType<typeof json> | ReturnType<typeof stream>;
let requests: Array<{ mode: string; repo: string }>;
let analyze: (body: { mode: string; repo: string }) => Promise<ResponseFixture>;
const originalFetch = global.fetch;
beforeEach(() => {
    localStorage.clear();
    mockSettings = { provider: "openai", apiKey: "dummy-caller-key", model: "gpt-4o-mini" };
    requests = [];
    jest.mocked(getCachedDiagram).mockReset().mockReturnValue(null);
    analyze = async body => json(result(body.mode === "smart" ? "smart" : "pending", body.mode === "smart" ? "Smart result" : "Premium result"));
    global.fetch = jest.fn(async (url, init) => {
        if (String(url).includes("/stream?")) return stream({ type: "done", payload: repository(new URL(String(url), "http://localhost").searchParams.get("repo")!) });
        const body = JSON.parse(String(init?.body)); requests.push(body); return analyze(body);
    }) as unknown as typeof fetch;
});

function pinnedCacheFixture(description: string, code = "flowchart TB\nA-->B") {
    const cache = jest.requireActual<typeof import("@/lib/diagram-cache")>("@/lib/diagram-cache");
    const snapshot = { schemaVersion: 1 as const, owner: "example", repo: "repo", selectedBranch: "main", defaultBranch: "main", status: "ready" as const, commitSha: "a".repeat(40), treeSha: "c".repeat(40), visibility: "public" as const, capturedAt: "2026-11-07T12:00:00.000Z" };
    cache.cacheDiagram("example", "repo", { architecture: { ...result().architecture, description, mermaidDiagram: code }, annotations: [], metadataSource: "ai" }, "ai", { snapshot, mode: "premium", provider: "openai", model: "gpt-4o-mini" });
    jest.mocked(getCachedDiagram).mockImplementation(cache.getCachedDiagram);
    const fixture = global.fetch;
    global.fetch = jest.fn((url, init) => String(url).includes("/stream?") ? Promise.resolve(stream({ type: "done", payload: { ...repository(), snapshot, fileTree: { ...repository().fileTree, sha: snapshot.treeSha } } })) : fixture(url, init)) as unknown as typeof fetch;
}

it("recovers a matching public cached Premium result with its provenance and previous-view label", async () => {
    pinnedCacheFixture("Pinned cached Premium");
    await open(); analyze = async () => { throw new Error("Fixture provider unavailable"); };
    generate(); await screen.findByText("Pinned cached Premium");
    expect(screen.getByText(/Showing previous Premium diagram/)).toBeInTheDocument();
    expect(mermaid.parse).toHaveBeenCalledWith("flowchart TB\nA-->B", expect.any(Object));
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});

it("does not promote an invalid cached Mermaid diagram to a verified fallback view", async () => {
    pinnedCacheFixture("Invalid cached Premium", "flowchart TB\nA[broken");
    await open(); jest.mocked(mermaid.parse).mockRejectedValueOnce(new Error("Invalid cached Mermaid"));
    analyze = async () => { throw new Error("Fixture provider unavailable"); };
    generate(); await screen.findByRole("alert");
    expect(view()).toHaveTextContent("Smart overview: repo.ts");
    expect(screen.queryByText("Invalid cached Premium")).not.toBeInTheDocument();
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});

it("abandons cached Mermaid validation when Normal supersedes its generation", async () => {
    pinnedCacheFixture("Obsolete cached Premium"); await open();
    const pending = deferred<never>(); jest.mocked(mermaid.parse).mockReturnValueOnce(pending.promise);
    generate(); normal(); await act(async () => pending.reject(new Error("Obsolete cached Mermaid")));
    expect(view()).toHaveTextContent("Smart overview: repo.ts");
    expect(requests.map(request => request.mode)).toEqual(["smart"]);
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});
afterEach(() => { global.fetch = originalFetch; });
const generate = () => fireEvent.click(screen.getByRole("button", { name: "Generate Premium Diagram" }));
const normal = () => fireEvent.click(screen.getByRole("button", { name: "Show Normal Diagram" }));
const view = () => screen.getByLabelText("Rendered architecture");
async function open() { const ui = render(<RepoPageClient owner="example" repo="repo" />); await screen.findByText("Smart overview: repo.ts"); return ui; }

it("attempts initial Smart once, including Strict Mode setup/cleanup", async () => {
    render(<StrictMode><RepoPageClient owner="example" repo="repo" /></StrictMode>);
    await screen.findByText("Smart overview: repo.ts");
    await act(async () => {});
    expect(requests.map(r => r.mode)).toEqual(["smart"]);
    expect(toast.success).not.toHaveBeenCalled();
});

it("makes a failed Smart attempt actionable and retries without an automatic loop", async () => {
    analyze = async () => { throw new Error("Fixture Smart unavailable"); };
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByRole("alert");
    expect(requests).toHaveLength(1);
    analyze = async () => json(result());
    fireEvent.click(screen.getByRole("button", { name: /Retry Smart/i }));
    await screen.findByText("Smart overview: repo.ts");
    expect(requests.map(r => r.mode)).toEqual(["smart", "smart"]);
});

it("returns Premium to the retained Smart result without requesting it again", async () => {
    await open(); generate(); await screen.findByText("Premium result");
    normal(); await screen.findByText("Smart overview: repo.ts");
    expect(requests.map(r => r.mode)).toEqual(["smart", "premium"]);
});

it("requests Smart once on Normal recovery when its initial attempt failed", async () => {
    let smart = 0;
    analyze = async body => { if (body.mode === "smart" && smart++ === 0) throw new Error("Fixture initial failure"); return json(result(body.mode === "smart" ? "smart" : "pending", "Premium result")); };
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByRole("alert"); generate(); await screen.findByText("Premium result");
    normal(); await screen.findByText("Smart overview: repo.ts");
    expect(requests.map(r => r.mode)).toEqual(["smart", "premium", "smart"]);
});

it("renderer fallback selects retained Smart and an explicit Smart retry does not loop", async () => {
    await open(); generate(); await screen.findByText("Premium result");
    fireEvent.click(screen.getByRole("button", { name: "Renderer fallback" }));
    await screen.findByText("Smart overview: repo.ts");
    expect(requests).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Renderer fallback" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    await screen.findByText("Smart overview: repo.ts");
});

it("keeps the previous valid diagram visibly labeled during retry, coalescing repeated clicks", async () => {
    await open(); generate(); await screen.findByText("Premium result");
    const pending = deferred<ResponseFixture>(); analyze = () => pending.promise;
    generate(); generate(); generate();
    expect(view()).toHaveTextContent("Premium result");
    expect(screen.getByText(/Showing previous Premium diagram/i)).toBeVisible();
    expect(requests.filter(r => r.mode === "premium")).toHaveLength(2);
    await act(async () => pending.reject(new Error("Fixture retry failed")));
    expect(view()).toHaveTextContent("Premium result");
    expect(screen.getByRole("alert")).toHaveTextContent("Fixture retry failed");
});

it.each(["resolve", "reject"])("ignores an obsolete Premium %s after switching to Normal", async outcome => {
    await open(); const pending = deferred<ResponseFixture>(); analyze = () => pending.promise;
    generate(); normal();
    await act(async () => outcome === "resolve" ? pending.resolve(json(result("pending", "Obsolete Premium"))) : pending.reject(new Error("Obsolete failure")));
    expect(view()).toHaveTextContent("Smart overview: repo.ts");
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/Obsolete/)).not.toBeInTheDocument();
});

it.each(["resolve", "reject"])("session A cannot %s into session B's view, pipeline, cache or toasts", async outcome => {
    const ui = await open(); const pending = deferred<ResponseFixture>(); analyze = () => pending.promise; generate();
    analyze = async () => json(result());
    ui.rerender(<RepoPageClient owner="example" repo="other" />);
    await screen.findByText("Smart overview: other.ts");
    await act(async () => outcome === "resolve" ? pending.resolve(json(result("pending", "Obsolete A"))) : pending.reject(new Error("Obsolete A failure")));
    expect(view()).toHaveTextContent("Smart overview: other.ts");
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
    expect(requests.filter(r => r.mode === "smart").map(r => r.repo)).toEqual(["repo", "other"]);
});

it.each(["provider", "key", "model", "github"])("invalidates results and in-flight analysis on a %s context change", async context => {
    await open(); const pending = deferred<ResponseFixture>(); analyze = () => pending.promise; generate();
    analyze = async () => json(result());
    if (context === "github") { fireEvent.click(screen.getByRole("button", { name: "Token" })); fireEvent.click(screen.getByRole("button", { name: "Save fixture token" })); }
    else {
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
        mockSettings = context === "provider" ? { ...mockSettings!, provider: "gemini", model: "gemini-2.5-flash" } : context === "key" ? { ...mockSettings!, apiKey: "dummy-different-key" } : { ...mockSettings!, model: "gpt-4o" };
        fireEvent.click(screen.getByRole("button", { name: "Save fixture settings" }));
    }
    await waitFor(() => expect(requests.filter(r => r.mode === "smart")).toHaveLength(2));
    await act(async () => pending.resolve(json(result("pending", "Obsolete credentials"))));
    expect(view()).toHaveTextContent("Smart overview: repo.ts");
    expect(cacheDiagram).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith("Premium AI diagram generated", expect.anything());
});

it("unmount invalidates in-flight analysis even when fetch ignores its signal", async () => {
    const ui = await open(); const pending = deferred<ResponseFixture>(); analyze = () => pending.promise; generate(); ui.unmount();
    await act(async () => pending.resolve(json(result("pending", "After unmount"))));
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});

it("retains a verified Premium result on fallback retry and labels it as previous", async () => {
    await open(); generate(); await screen.findByText("Premium result");
    analyze = async () => json(result("fallback", "Fallback must not replace Premium"));
    generate();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Premium Diagram" })).toBeEnabled());
    await screen.findByText(/Showing previous Premium diagram/i);
    expect(view()).toHaveTextContent("Premium result");
    expect(view()).not.toHaveTextContent("Fallback must not replace Premium");
    expect(cacheDiagram).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    normal(); await screen.findByText("Smart overview: repo.ts");
});

it("ignores old SSE stages and completion while a replacement Smart recovery is pending", async () => {
    analyze = async () => { throw new Error("Initial Smart failure"); };
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByRole("alert");
    const late = deferred<{ done: boolean; value?: Uint8Array }>();
    const replacement = deferred<ResponseFixture>();
    let consumed = false;
    analyze = async body => body.mode === "smart" ? replacement.promise : {
        ok: true, status: 200, headers: new Headers({ "content-type": "text/event-stream" }),
        body: { getReader: () => ({ read: () => consumed ? Promise.resolve({ done: true }) : (consumed = true, late.promise) }) },
    };
    generate(); await act(async () => {}); normal();
    await act(async () => late.resolve({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ step: "understand", status: "error", message: "Obsolete SSE stage", data: result("pending", "Obsolete SSE result") })}\n\n`) }));
    expect(screen.queryByText(/Obsolete SSE/)).not.toBeInTheDocument();
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Analysis in progress")).toBeVisible());
    await act(async () => replacement.resolve(json(result())));
    await screen.findByText("Smart overview: repo.ts");
});

it("does not leave a repository without tree data on a permanent analysis pipeline", async () => {
    global.fetch = jest.fn(async () => stream({ type: "done", payload: { ...repository(), fileTree: null } })) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByText("No data available for this view.");
    expect(screen.queryByText("Waiting for analysis")).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
});

it("a pending initial Smart result cannot replace Premium, and Normal can request Smart again", async () => {
    const oldSmart = deferred<ResponseFixture>(); let smartCalls = 0;
    analyze = async body => body.mode === "smart" && smartCalls++ === 0 ? oldSmart.promise : json(result(body.mode === "smart" ? "smart" : "pending", "Premium result"));
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByRole("button", { name: "Generate Premium Diagram" });
    await waitFor(() => expect(requests).toHaveLength(1));
    generate(); await screen.findByText("Premium result");
    await act(async () => oldSmart.resolve(json(result())));
    expect(view()).toHaveTextContent("Premium result");
    normal(); await screen.findByText("Smart overview: repo.ts");
    expect(requests.map(r => r.mode)).toEqual(["smart", "premium", "smart"]);
});

it("resets incompatible results for a replacement tree but not optional enrichment", async () => {
    const enrichment = deferred<{ done: boolean; value?: Uint8Array }>();
    const replacement = deferred<{ done: boolean; value?: Uint8Array }>();
    const encode = (event: unknown) => ({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`) });
    const fetchFixture = global.fetch;
    let index = 0;
    global.fetch = jest.fn((url, init) => String(url).includes("/stream?") ? Promise.resolve({
        ok: true, status: 200, headers: new Headers({ "content-type": "text/event-stream" }),
        body: { getReader: () => ({ read: async () => {
            switch (index++) { case 0: return encode({ type: "done", payload: repository() }); case 1: return enrichment.promise; case 2: return replacement.promise; default: return { done: true }; }
        } }) },
    }) : fetchFixture(url, init)) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByText("Smart overview: repo.ts"); generate(); await screen.findByText("Premium result");
    await act(async () => enrichment.resolve(encode({ type: "enriched", payload: { metadata: repository().metadata, mergedPRs: [], contributors: [] } })));
    expect(view()).toHaveTextContent("Premium result");
    expect(requests.map(r => r.mode)).toEqual(["smart", "premium"]);
    const next = repository("repo", "replacement-tree"); next.fileTree.tree[0].path = "replacement.ts";
    await act(async () => replacement.resolve(encode({ type: "done", payload: next })));
    await screen.findByText("Smart overview: replacement.ts");
    expect(screen.queryByRole("button", { name: "Show Normal Diagram" })).not.toBeInTheDocument();
    expect(requests.map(r => r.mode)).toEqual(["smart", "premium", "smart"]);
});

it("the real Mermaid error screen keeps explicit retry and fallback actions without automatic fallback", async () => {
    jest.useFakeTimers();
    const expectedError = jest.spyOn(console, "error").mockImplementation(() => {});
    const ActualMermaid = jest.requireActual<typeof import("@/components/diagrams/mermaid-diagram")>("@/components/diagrams/mermaid-diagram").default;
    const fallback = jest.fn();
    const ui = render(<ActualMermaid code={"flowchart TB\nA-->B"} onFallback={fallback} />);
    try {
        await act(async () => { await jest.advanceTimersByTimeAsync(120); });
        expect(screen.getByRole("alert")).toHaveTextContent("Fixture renderer failure");
        expect(fallback).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
        await act(async () => { await jest.advanceTimersByTimeAsync(120); });
        expect(screen.getByRole("alert")).toHaveTextContent("Fixture renderer failure");
        expect(mermaid.render).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "Show Smart Diagram Instead" }));
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict" }));
    } finally { ui.unmount(); jest.clearAllTimers(); jest.useRealTimers(); expectedError.mockRestore(); }
});

it("does not reintroduce a legacy cached result after a known credential-context change", async () => {
    await open(); generate(); await screen.findByText("Premium result");
    localStorage.setItem("gitviz_diagram_cache:example/repo|anon|premium", JSON.stringify({ architecture: result("pending", "Incompatible cached Premium").architecture, annotations: [], source: "ai", cachedAt: "2026-10-29T00:00:00Z" }));
    jest.mocked(getCachedDiagram).mockImplementation(jest.requireActual<typeof import("@/lib/diagram-cache")>("@/lib/diagram-cache").getCachedDiagram);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    mockSettings = { provider: "gemini", apiKey: "dummy-new-context", model: "gemini-2.5-flash" };
    fireEvent.click(screen.getByRole("button", { name: "Save fixture settings" }));
    await screen.findByText("Smart overview: repo.ts");
    analyze = async () => { throw new Error("Fixture new provider unavailable"); };
    generate(); await screen.findByRole("alert");
    expect(view()).toHaveTextContent("Smart overview: repo.ts");
    expect(screen.queryByText("Incompatible cached Premium")).not.toBeInTheDocument();
    expect(cacheDiagram).toHaveBeenCalledTimes(1);
});

it("shows an explicit empty-code snapshot instead of an analysis pipeline or invented SHA", async () => {
    global.fetch = jest.fn(async () => stream({ type: "done", payload: { ...repository(), fileTree: null, snapshot: { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "empty", commitSha: null, treeSha: null } } })) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByText(/This repository has no commits yet/);
    expect(screen.getByRole("note", { name: "Repository snapshot" })).toHaveTextContent(/Empty repository/);
    expect(requests).toHaveLength(0);
});

it("labels the captured revision and suppresses A's Premium completion after a same-tree snapshot B arrives", async () => {
    const A = "a".repeat(40), B = "b".repeat(40), T = "c".repeat(40);
    const first = { ...repository(), fileTree: { ...repository().fileTree, sha: T }, snapshot: { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: A, treeSha: T } };
    const next = deferred<{ done: boolean; value?: Uint8Array }>(); let read = 0;
    const fetchFixture = global.fetch;
    global.fetch = jest.fn((url, init) => String(url).includes("/stream?") ? Promise.resolve({ ok: true, status: 200, headers: new Headers({ "content-type": "text/event-stream" }), body: { getReader: () => ({ read: async () => read++ === 0 ? { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", payload: first })}\n\n`) } : read === 2 ? next.promise : { done: true } }) } }) : fetchFixture(url, init)) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />); await screen.findByText("Smart overview: repo.ts");
    expect(screen.getByRole("note", { name: "Repository snapshot" })).toHaveTextContent("aaaaaaa");
    const old = deferred<ResponseFixture>(); analyze = () => old.promise; generate();
    analyze = async () => json(result());
    await act(async () => next.resolve({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", payload: { ...first, snapshot: { ...first.snapshot, commitSha: B, capturedAt: "2026-10-30T13:00:00.000Z" } } })}\n\n`) }));
    await waitFor(() => expect(requests.filter(r => r.mode === "smart")).toHaveLength(2));
    await screen.findByText("Smart overview: repo.ts");
    await act(async () => old.resolve(json(result("pending", "Obsolete snapshot Premium"))));
    expect(screen.getByRole("note", { name: "Repository snapshot" })).toHaveTextContent("bbbbbbb");
    expect(view()).toHaveTextContent("Smart overview: repo.ts"); expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});

it("distinguishes a captured empty tree from a repository with no commits", async () => {
    global.fetch = jest.fn(async () => stream({ type: "done", payload: { ...repository(), fileTree: { sha: "c".repeat(40), tree: [], truncated: false }, snapshot: { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } } })) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByText("This snapshot contains no files.");
    expect(screen.getByRole("note", { name: "Repository snapshot" })).toHaveTextContent("aaaaaaa"); expect(requests).toHaveLength(0);
});

it("does not replace a pinned Smart view with a legacy cached diagram whose revision is unknown", async () => {
    const fetchFixture = global.fetch;
    const data = { ...repository(), fileTree: { ...repository().fileTree, sha: "c".repeat(40) }, snapshot: { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } };
    global.fetch = jest.fn((url, init) => String(url).includes("/stream?") ? Promise.resolve(stream({ type: "done", payload: data })) : fetchFixture(url, init)) as unknown as typeof fetch;
    localStorage.setItem("gitviz_diagram_cache:example/repo|anon|premium", JSON.stringify({ architecture: result("pending", "Unknown revision cache").architecture, annotations: [], source: "ai", cachedAt: "2026-10-29T00:00:00.000Z" }));
    jest.mocked(getCachedDiagram).mockImplementation(jest.requireActual<typeof import("@/lib/diagram-cache")>("@/lib/diagram-cache").getCachedDiagram);
    render(<RepoPageClient owner="example" repo="repo" />); await screen.findByText("Smart overview: repo.ts");
    analyze = async () => { throw new Error("Fixture Premium unavailable"); }; generate(); await screen.findByRole("alert");
    expect(view()).toHaveTextContent("Smart overview: repo.ts"); expect(screen.queryByText("Unknown revision cache")).not.toBeInTheDocument();
    expect(cacheDiagram).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
});
