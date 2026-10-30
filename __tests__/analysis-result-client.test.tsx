import { TextDecoder, TextEncoder } from "node:util";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RepoPageClient from "@/app/[owner]/[repo]/repo-page-client";
import { cacheDiagram, getCachedDiagram } from "@/lib/diagram-cache";
import { toast } from "sonner";
import type { ArchitectureAnalysis } from "@/types";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=architecture"), useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
jest.mock("@/components/dashboard/navbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/tab-nav", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/repo-onboarding-guide", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/clone-progress-screen", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/ai-settings-modal", () => ({ __esModule: true, default: () => null, loadAISettings: () => ({ provider: "openai", apiKey: "caller-test-only", model: "gpt-4o-mini" }) }));
jest.mock("@/components/dashboard/github-token-modal", () => ({ __esModule: true, default: () => null, consumeOneTimeGitHubToken: () => "", setOneTimeGitHubToken: jest.fn() }));
jest.mock("@/components/diagrams/file-tree-graph", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/branch-graph", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/contributors-network", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/dependency-graph", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/architecture-diagram", () => ({ __esModule: true, default: ({ analysis, source }: { analysis: ArchitectureAnalysis; source: string }) => <div role="region" aria-label="Architecture result">{source}: {analysis.description}</div> }));
jest.mock("@/lib/diagram-cache", () => ({ hashToken: () => "anon", getCachedDiagram: jest.fn(), cacheDiagram: jest.fn() }));
jest.mock("mermaid", () => ({ __esModule: true, default: { parse: jest.fn(async (code: string) => code.includes("broken") ? false : { diagramType: "flowchart-v2" }) } }));
jest.mock("sonner", () => ({ toast: { loading: jest.fn(() => "toast"), success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() } }));

Object.assign(globalThis, { TextDecoder, TextEncoder });
const architecture: ArchitectureAnalysis = { techStack: [], architecturePattern: "Modular", description: "Smart result", modules: [], entryPoints: [], dataFlow: [], mermaidDiagram: "flowchart TB\nA-->B" };
const cached = { architecture: { ...architecture, description: "Verified previous diagram" }, annotations: [], source: "ai" as const, cachedAt: "2026-10-29T00:00:00Z" };
const provider = { architecture: { ...architecture, description: "Provider result" }, annotations: [] };
const repo = { metadata: { owner: "example", repo: "repo", fullName: "example/repo", description: "Repository", stars: 0, forks: 0, watchers: 0, openIssues: 0, license: null, topics: [], language: "TypeScript", pushedAt: "2026-10-29", defaultBranch: "main", htmlUrl: "https://github.com/example/repo" }, fileTree: { sha: "tree", truncated: false, tree: [{ path: "index.ts", type: "blob", mode: "100644", sha: "blob", url: "url" }] }, contributors: [], branches: [], commits: [], readme: "", languages: {}, dependencyFiles: [], mergedPRs: [] };
const json = (data: unknown) => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => data });
const stream = (data: unknown) => {
    const value = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
    return { ok: true, status: 200, headers: new Headers({ "content-type": "text/event-stream" }), body: { getReader: () => {
        let read = false;
        return { read: async () => read ? { done: true } : (read = true, { done: false, value }) };
    } } };
};
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

async function openAndGenerate(response: unknown, haveCache = true) {
    jest.mocked(getCachedDiagram).mockImplementation((_owner, _repo, opts) => opts?.mode === "premium" && haveCache ? cached : null);
    global.fetch = jest.fn(async (url, init) => String(url).includes("/stream?") ? stream({ type: "done", payload: repo })
        : JSON.parse(String(init?.body)).mode === "smart" ? json({ architecture, annotations: [], source: "smart", metadataSource: "deterministic", mode: "smart", mock: true }) : response) as unknown as typeof fetch;
    render(<RepoPageClient owner="example" repo="repo" />);
    await screen.findByText("smart: Smart result");
    fireEvent.click(screen.getByRole("button", { name: "Generate Premium Diagram" }));
}

it.each(["json", "sse"])("does not accept missing provenance as Premium success over %s", async transport => {
    await openAndGenerate(transport === "json" ? json(provider) : stream({ step: "enrich", status: "complete", data: provider }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Architecture result" })).toHaveTextContent("Verified previous diagram"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(cacheDiagram).not.toHaveBeenCalled();
});

it("keeps a verified cached AI diagram when a JSON response explicitly falls back", async () => {
    await openAndGenerate(json({ ...provider, source: "fallback", metadataSource: "deterministic", mode: "premium", mock: true }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Architecture result" })).toHaveTextContent("Verified previous diagram"));
    expect(cacheDiagram).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
});

it.each(["json", "sse"])("does not cache or announce invalid Mermaid as verified AI over %s", async transport => {
    const data = { ...provider, architecture: { ...provider.architecture, mermaidDiagram: "flowchart TB\nA[broken" }, source: "pending", metadataSource: "ai" };
    await openAndGenerate(transport === "json" ? json(data) : stream({ step: "enrich", status: "complete", data }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Architecture result" })).toHaveTextContent("Verified previous diagram"));
    expect(cacheDiagram).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
});

it("promotes a syntax-validated candidate, independently of metadata fallback", async () => {
    await openAndGenerate(stream({ step: "enrich", status: "complete", data: { ...provider, source: "pending", metadataSource: "deterministic" } }), false);
    await waitFor(() => expect(screen.getByRole("region", { name: "Architecture result" })).toHaveTextContent("ai: Provider result"));
    expect(cacheDiagram).toHaveBeenCalledWith("example", "repo", expect.objectContaining({ architecture: expect.objectContaining({ description: "Provider result" }) }), "ai", expect.any(Object));
    expect(toast.success).toHaveBeenCalled();
});

it("sends AI credentials only with Premium requests and omits unused GitHub tree fields", async () => {
    await openAndGenerate(json({ ...provider, source: "pending", metadataSource: "ai" }), false);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const requests = jest.mocked(global.fetch).mock.calls.filter(([url]) => url === "/api/analyze").map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({ owner: "example", repo: "repo", mode: "smart", tree: [{ path: "index.ts", type: "blob" }] });
    expect(requests[1]).toMatchObject({ mode: "premium", aiSettings: { apiKey: "caller-test-only" } });
});
