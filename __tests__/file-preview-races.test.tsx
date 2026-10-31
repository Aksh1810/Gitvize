import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileTreeGraph from "@/components/diagrams/file-tree-graph";
import type Graph from "graphology";
import type { TreeItem } from "@/types";

jest.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("sigma", () => ({ __esModule: true, default: class {
    constructor(graph: Graph) { mockGraphs.push(graph); }
    on() {} setSetting() {} refresh() {} scheduleRefresh() {} kill() {} resize() {}
    getMouseCaptor() { return { on: () => {} }; } getNodeDisplayData() { return null; } getDimensions() { return { width: 800, height: 600 }; }
    getCamera() { return { getState: () => ({ x: 0, y: 0, ratio: 1, angle: 0 }), on: () => {}, setState: () => {}, animatedReset: () => {} }; }
} }));

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tree: TreeItem[] = ["a.txt", "b.txt"].map(path => ({ path, type: "blob", mode: "100644", sha: `blob-${path}`, url: "", size: 100 }));
const text = (content: string) => ({ ok: true, text: async () => content });
const mockGraphs: Graph[] = [];
const mockWorkers: Worker[] = [];
const mockWorkerMessages: Array<{ type: string; fileContents?: Array<{ path: string; content: string }> }> = [];
const originalFetch = global.fetch;
const originalWorker = global.Worker;
const originalObserver = global.ResizeObserver;
beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1024);
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    global.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    mockWorkerMessages.length = 0; mockGraphs.length = 0; mockWorkers.length = 0;
    global.Worker = class { constructor() { mockWorkers.push(this as unknown as Worker); } onmessage = null; onerror = null; lastMessageType = ""; postMessage(message: { type: string }) { this.lastMessageType = message.type; mockWorkerMessages.push(message); } terminate() {} } as unknown as typeof Worker;
});
afterEach(() => { global.fetch = originalFetch; global.Worker = originalWorker; global.ResizeObserver = originalObserver; jest.restoreAllMocks(); });
function choose(path: string) { const input = screen.getByRole("searchbox", { name: "Find a file by name or path" }); fireEvent.change(input, { target: { value: path } }); fireEvent.keyDown(input, { key: "Enter" }); }

it("keeps B's selected label/content when an aborted A resolves after B", async () => {
    const a = deferred<ReturnType<typeof text>>();
    global.fetch = jest.fn((url) => String(url).includes("/file?") ? new URL(String(url), "http://localhost").searchParams.get("path") === "a.txt" ? a.promise : Promise.resolve(text("CURRENT_B")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<StrictMode><FileTreeGraph tree={tree} owner="example" repo="repo" /></StrictMode>);
    choose("a.txt"); choose("b.txt"); await screen.findByText("CURRENT_B");
    const calls = jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/file?"));
    await act(async () => a.resolve(text("OBSOLETE_A")));
    expect(screen.getByRole("region", { name: "Selected file path" })).toHaveTextContent("b.txt");
    expect(screen.getByText("CURRENT_B")).toBeInTheDocument();
    expect(screen.queryByText("OBSOLETE_A")).not.toBeInTheDocument();
    expect(calls[0][1]?.signal?.aborted).toBe(true);
});

it.each(["resolve", "reject"])("ignores A's late %s after B succeeds, including body processing", async outcome => {
    const body = deferred<string>();
    global.fetch = jest.fn(url => String(url).includes("/file?") ? Promise.resolve(String(url).includes("path=a.txt") ? { ok: true, text: () => body.promise } : text("CURRENT_B")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={tree} owner="example" repo="repo" />);
    choose("a.txt"); await act(async () => {}); choose("b.txt"); await screen.findByText("CURRENT_B");
    await act(async () => outcome === "resolve" ? body.resolve("OBSOLETE_A") : body.reject(new Error("Old transport failure")));
    expect(screen.getByText("CURRENT_B")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected file path" })).toHaveTextContent("b.txt");
    expect(screen.queryByText(/OBSOLETE_A|Could not reach|Loading file/)).not.toBeInTheDocument();
});

it("an obsolete finally cannot stop B's loading indicator", async () => {
    const a = deferred<ReturnType<typeof text>>(), b = deferred<ReturnType<typeof text>>();
    global.fetch = jest.fn(url => String(url).includes("/file?") ? String(url).includes("path=a.txt") ? a.promise : b.promise : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={tree} owner="example" repo="repo" />); choose("a.txt"); choose("b.txt");
    await act(async () => a.resolve(text("OBSOLETE_A")));
    expect(screen.getByText("Loading file...")).toBeInTheDocument();
    await act(async () => b.resolve(text("CURRENT_B"))); await screen.findByText("CURRENT_B");
});

it.each(["resolve", "reject"])("closing the inspector aborts A and ignores its late %s before reopening", async outcome => {
    const a = deferred<ReturnType<typeof text>>(); let reads = 0;
    global.fetch = jest.fn(url => String(url).includes("/file?") ? ++reads === 1 ? a.promise : Promise.resolve(text("REOPENED_A")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={tree} owner="example" repo="repo" />); choose("a.txt");
    const signal = jest.mocked(global.fetch).mock.calls.find(([url]) => String(url).includes("/file?"))?.[1]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Collapse inspector" }));
    await act(async () => outcome === "resolve" ? a.resolve(text("OBSOLETE_A")) : a.reject(new Error("Old connection")));
    fireEvent.click(screen.getByRole("button", { name: "Show inspector" }));
    await screen.findByText("REOPENED_A");
    expect(signal?.aborted).toBe(true); expect(screen.queryByText(/OBSOLETE_A|Could not reach/)).not.toBeInTheDocument();
});

it.each(["owner", "repo", "token", "revision"])("owns file data across a %s context change", async context => {
    const a = deferred<ReturnType<typeof text>>(); let reads = 0;
    global.fetch = jest.fn(url => String(url).includes("/file?") ? ++reads === 1 ? a.promise : Promise.resolve(text("NEW_CONTEXT")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={tree} owner="example" repo="repo" githubToken="dummy-old" />); choose("a.txt");
    ui.rerender(<FileTreeGraph tree={context === "revision" ? tree.map(item => ({ ...item, sha: "new-blob" })) : tree} owner={context === "owner" ? "other" : "example"} repo={context === "repo" ? "other" : "repo"} githubToken={context === "token" ? "dummy-new" : "dummy-old"} />);
    await screen.findByText("NEW_CONTEXT");
    await act(async () => a.reject(new Error("Obsolete context failed")));
    expect(screen.getByText("NEW_CONTEXT")).toBeInTheDocument();
    expect(screen.queryByText(/Could not reach|Loading file/)).not.toBeInTheDocument();
    const calls = jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/file?"));
    expect(calls[0][1]?.signal?.aborted).toBe(true);
    if (context === "token") expect(calls[1][1]?.headers).toEqual({ "x-github-token": "dummy-new" });
});

it("unmount aborts its request and does not start body processing after late headers", async () => {
    const a = deferred<ReturnType<typeof text>>(), read = jest.fn(async () => "OBSOLETE_A");
    global.fetch = jest.fn(url => String(url).includes("/file?") ? a.promise : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    const ui = render(<StrictMode><FileTreeGraph tree={tree} owner="example" repo="repo" /></StrictMode>); choose("a.txt"); ui.unmount();
    await act(async () => a.resolve({ ok: true, text: read }));
    const call = jest.mocked(global.fetch).mock.calls.find(([url]) => String(url).includes("/file?"));
    expect(call?.[1]?.signal?.aborted).toBe(true); expect(read).not.toHaveBeenCalled();
});

it.each(["ts", "py"])("does not reuse source cache from another credential context for %s", async ext => {
    const sources: TreeItem[] = [{ ...tree[0], path: `source.${ext}` }];
    global.fetch = jest.fn(async (url, init) => String(url).includes("/files") ? { ok: true, json: async () => ({ files: [{ path: `source.${ext}`, content: (init?.headers as Headers).get("x-github-token") === "dummy-new" ? "NEW_SOURCE" : "OLD_SOURCE" }] }) } : { ok: false }) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={sources} owner="example" repo="repo" githubToken="dummy-old" />);
    await waitFor(() => expect(mockWorkerMessages.some(m => m.fileContents?.some(f => f.content === "OLD_SOURCE"))).toBe(true));
    ui.rerender(<FileTreeGraph tree={sources} owner="example" repo="repo" githubToken="dummy-new" />);
    await waitFor(() => expect(mockWorkerMessages.some(m => m.fileContents?.some(f => f.content === "NEW_SOURCE"))).toBe(true));
    expect(jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/files"))).toHaveLength(2);
});

it("unmount stops later source batches and cannot start an obsolete import worker", async () => {
    const pending = deferred<{ ok: boolean; json: () => Promise<{ files: Array<{ path: string; content: string }> }> }>();
    const sources: TreeItem[] = Array.from({ length: 60 }, (_, i) => ({ ...tree[0], path: `source-${i}.py` }));
    global.fetch = jest.fn(url => String(url).includes("/files") ? pending.promise : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={sources} owner="example" repo="repo" />);
    await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes("/files"))).toBe(true));
    ui.unmount();
    await act(async () => pending.resolve({ ok: true, json: async () => ({ files: [{ path: sources[0].path, content: "OBSOLETE_SOURCE" }] }) }));
    const calls = jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/files"));
    expect(calls).toHaveLength(1); expect(calls[0][1]?.signal?.aborted).toBe(true);
    expect(mockWorkerMessages.some(m => m.type === "extractFileToFileImports")).toBe(false);
});

it.each(["ts", "py"])("does not turn a cancelled %s source batch into an empty worker result", async ext => {
    const sources: TreeItem[] = [{ ...tree[0], path: `source.${ext}` }];
    global.fetch = jest.fn(url => String(url).includes("/files") ? Promise.reject(new DOMException("Cancelled", "AbortError")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={sources} owner="example" repo="repo" />);
    await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes("/files"))).toBe(true));
    expect(mockWorkerMessages.some(m => m.type === "buildSymbolGraph" || m.type === "extractFileToFileImports")).toBe(false);
});

it("preserves actionable current file-service errors while clearing them on the next selection", async () => {
    global.fetch = jest.fn(url => String(url).includes("/file?") ? Promise.resolve(String(url).includes("path=a.txt") ? { ok: false, status: 429, json: async () => ({ error: "Fixture quota reached. Retry later." }) } : text("CURRENT_B")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={tree} owner="example" repo="repo" />); choose("a.txt");
    await screen.findByText("Fixture quota reached. Retry later."); choose("b.txt"); await screen.findByText("CURRENT_B");
    expect(screen.queryByText("Fixture quota reached. Retry later.")).not.toBeInTheDocument();
});

it("guards an obsolete HTTP error body parsed after B succeeds", async () => {
    const body = deferred<{ error: string }>();
    global.fetch = jest.fn(url => String(url).includes("/file?") ? Promise.resolve(String(url).includes("path=a.txt") ? { ok: false, status: 429, json: () => body.promise } : text("CURRENT_B")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<FileTreeGraph tree={tree} owner="example" repo="repo" />); choose("a.txt"); await act(async () => {}); choose("b.txt");
    await screen.findByText("CURRENT_B"); await act(async () => body.resolve({ error: "OBSOLETE_ERROR" }));
    expect(screen.getByText("CURRENT_B")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_ERROR")).not.toBeInTheDocument();
});

it("invalidates file and seed ownership for different commits with identical tree input", async () => {
    const snapshotA = { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } as const;
    const pending = deferred<ReturnType<typeof text>>(); let reads = 0;
    global.fetch = jest.fn(url => String(url).includes("/file?") ? ++reads === 1 ? pending.promise : Promise.resolve(text("NEW_COMMIT_CONTENT")) : Promise.resolve({ ok: false })) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={tree} owner="example" repo="repo" snapshot={snapshotA} />); choose("a.txt");
    ui.rerender(<FileTreeGraph tree={tree} owner="example" repo="repo" snapshot={{ ...snapshotA, commitSha: "b".repeat(40) }} />);
    await screen.findByText("NEW_COMMIT_CONTENT"); await act(async () => pending.resolve(text("OLD_COMMIT_CONTENT")));
    expect(screen.queryByText("OLD_COMMIT_CONTENT")).not.toBeInTheDocument();
    const seedRequests = jest.mocked(global.fetch).mock.calls.filter(([url]) => String(url).includes("/graph/seed"));
    expect(seedRequests.map(([url]) => JSON.parse(new URL(String(url), "http://localhost").searchParams.get("snapshot")!).commitSha)).toEqual([snapshotA.commitSha, "b".repeat(40)]);
    expect(seedRequests[0][1]?.signal?.aborted).toBe(true);
});

it("ignores a retired snapshot worker even if it supplies the current epoch", async () => {
    const snapshotA = { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } as const;
    global.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={tree} owner="example" repo="repo" snapshot={snapshotA} />);
    await waitFor(() => expect(mockWorkers.length).toBe(1)); const oldWorker = mockWorkers[0];
    ui.rerender(<FileTreeGraph tree={tree} owner="example" repo="repo" snapshot={{ ...snapshotA, commitSha: "b".repeat(40) }} />);
    await waitFor(() => expect(mockWorkers.length).toBe(2)); const current = mockWorkers[1];
    const init = mockWorkerMessages.filter(m => m.type === "init").at(-1) as unknown as { epoch: number };
    await act(async () => {
        current.onmessage?.({ data: { type: "ready", epoch: init.epoch, ids: ["root", "file:a.txt", "file:b.txt"] } } as MessageEvent);
        oldWorker.onmessage?.({ data: { type: "ready", epoch: init.epoch, ids: ["file:b.txt"] } } as MessageEvent);
        current.onmessage?.({ data: { type: "tick", epoch: init.epoch, positions: new Float32Array([111, 222, 333, 444, 555, 666]) } } as MessageEvent);
        await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(mockGraphs.at(-1)?.getNodeAttribute("root", "x")).toBe(111);
});

it("does not seed a new snapshot graph with symbols retained from the previous commit", async () => {
    const snapshotA = { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } as const;
    const sources: TreeItem[] = [{ ...tree[0], path: "source.ts" }]; let reads = 0;
    const pending = deferred<{ files: Array<{ path: string; content: string }> }>();
    global.fetch = jest.fn(async url => String(url).includes("/files") ? { ok: true, json: () => ++reads === 1 ? Promise.resolve({ files: [{ path: "source.ts", content: "source" }] }) : pending.promise } : { ok: false }) as unknown as typeof fetch;
    const ui = render(<FileTreeGraph tree={sources} owner="example" repo="repo" snapshot={snapshotA} />);
    const worker = () => mockWorkers.find(w => (w as Worker & { lastMessageType?: string }).lastMessageType === "buildSymbolGraph");
    await waitFor(() => expect(worker()).toBeDefined());
    await act(async () => worker()?.onmessage?.({ data: { type: "symbolGraph", data: { symbols: [{ name: "OLD_ONLY", kind: "function", filePath: "source.ts" }], references: [] } } } as MessageEvent));
    await waitFor(() => expect(mockGraphs.at(-1)?.hasNode("symbol:source.ts:function:OLD_ONLY")).toBe(true));
    ui.rerender(<FileTreeGraph tree={sources} owner="example" repo="repo" snapshot={{ ...snapshotA, commitSha: "b".repeat(40) }} />);
    await waitFor(() => expect(mockGraphs.length).toBe(2));
    expect(mockGraphs.at(-1)?.hasNode("symbol:source.ts:function:OLD_ONLY")).toBe(false);
    await act(async () => pending.resolve({ files: [{ path: "source.ts", content: "new source" }] }));
});
