import { TextDecoder, TextEncoder } from "node:util";
import { fireEvent, render, screen } from "@testing-library/react";
import RepoPageClient from "@/app/[owner]/[repo]/repo-page-client";
import { createBranchHistory } from "@/lib/branch-history";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=dependencies"), useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock("@/components/dashboard/navbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/repo-onboarding-guide", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/dashboard/ai-settings-modal", () => ({ __esModule: true, loadAISettings: () => null, default: () => null }));
jest.mock("@/components/dashboard/github-token-modal", () => ({ __esModule: true, consumeOneTimeGitHubToken: () => "", setOneTimeGitHubToken: jest.fn(), default: () => null }));
jest.mock("@/components/diagrams/file-tree-graph", () => ({ __esModule: true, default: ({ coverage }: { coverage?: { upstreamTruncated: boolean } }) => <p>File view fixture coverage: {coverage?.upstreamTruncated ? "truncated" : "unknown"}</p> }));
jest.mock("@/components/diagrams/architecture-diagram", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/diagrams/commit-history-rail", () => ({ __esModule: true, default: () => null }));
Object.assign(globalThis, { TextDecoder, TextEncoder });
const originalFetch = global.fetch;
const originalScroll = HTMLElement.prototype.scrollIntoView;
const A = "a".repeat(40);
const history = createBranchHistory("main", A, { 1: { status: "ready", headSha: A, page: 1, perPage: 100, commits: [], nextPage: null } });
const base = {
    metadata: { owner: "example", repo: "fixture", fullName: "example/fixture", defaultBranch: "main", description: "Fixture", stars: 0, forks: 0, topics: [] },
    fileTree: { sha: "c".repeat(40), truncated: false, tree: [{ path: "a.txt", type: "blob" }] },
    contributors: [], branches: [], commits: [], defaultHistory: history, readme: "", dependencyFiles: [], languages: {}, mergedPRs: [],
};
function respond(payload: unknown) {
    global.fetch = jest.fn(async url => String(url).includes("/stream?") ? {
        ok: true, headers: new Headers(), body: { getReader: () => { let sent = false; return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", payload })}\n\n`) }) }; } },
    } : { ok: true, json: async () => ({ architecture: { techStack: [], architecturePattern: "Modular", description: "Fixture", modules: [], entryPoints: [], dataFlow: [] }, annotations: [], source: "smart", metadataSource: "deterministic" }) }) as unknown as typeof fetch;
}
beforeEach(() => { localStorage.clear(); HTMLElement.prototype.scrollIntoView = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; HTMLElement.prototype.scrollIntoView = originalScroll; });
it("carries SSE section status into real dependency, contributor and branch views without clearing usable rows", async () => {
    const people = [{ login: "fixture-person", id: 1, avatarUrl: "", contributions: 3, htmlUrl: "https://github.com/fixture-person" }];
    const issue = { code: "upstream", status: 503, message: "Another manifest could not be loaded; try again." };
    respond({ ...base, schemaVersion: 2, sections: {
        dependencyFiles: { status: "partial", data: [{ filename: "requirements.txt", content: "requests==2" }], errors: [issue] },
        contributors: { status: "partial", data: people, errors: [{ ...issue, message: "Contributor page unavailable; loaded people remain available." }] },
        branches: { status: "error", error: { code: "forbidden", status: 403, message: "Branch list access was denied." } },
        languages: { status: "error", error: { ...issue, message: "Language statistics could not be loaded; try again." } },
        readme: { status: "ready", data: "" }, mergedPRs: { status: "ready", data: [] },
    } });
    render(<RepoPageClient owner="example" repo="fixture" />);
    await screen.findByText("requests");
    expect(screen.getByText(/Another manifest could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/Language statistics could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText("Branch list unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Contributors/ }));
    await screen.findByText("fixture-person"); expect(screen.getByText(/Contributor page unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Branches$/ }));
    await screen.findByText(/Branch list access was denied/);
    expect(screen.getByText("No commits in this captured history.")).toBeInTheDocument();
    expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes("/commits?"))).toBe(false);
});
it("accepts a compatible legacy collection but labels its coverage unknown", async () => {
    respond(base); render(<RepoPageClient owner="example" repo="fixture" />);
    await screen.findAllByText(/Coverage is unavailable for this older response/);
    expect(screen.queryByText(/No root dependency manifests found/)).not.toBeInTheDocument();
});
it("does not call an upstream-truncated empty enumeration a confirmed empty snapshot", async () => {
    respond({ ...base, snapshot: { schemaVersion: 1, owner: "example", repo: "fixture", selectedBranch: "main", defaultBranch: "main", status: "ready", commitSha: A, treeSha: "c".repeat(40), visibility: "public", capturedAt: "2026-11-09T00:00:00.000Z" }, fileTree: { sha: "c".repeat(40), tree: [], truncated: true, coverage: { upstreamTruncated: true, applicationCapped: false, enumeratedTreeItems: 0, enumeratedFiles: 0, retainedTreeItems: 0, retainedFiles: 0, totalTreeItems: null, totalFiles: null } } });
    render(<RepoPageClient owner="example" repo="fixture" />);
    await screen.findAllByText(/Coverage is unavailable/);
    fireEvent.click(screen.getByRole("button", { name: /File Tree/ }));
    await screen.findByText("File view fixture coverage: truncated");
    expect(screen.queryByText("This snapshot contains no files.")).not.toBeInTheDocument();
});
