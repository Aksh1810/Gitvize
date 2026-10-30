import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BranchGraph from "@/components/diagrams/branch-graph";
import type { Commit } from "@/types";

jest.mock("@/components/diagrams/commit-history-rail", () => ({
    __esModule: true,
    default: ({ commits, selectedBranchOverride }: { commits: Commit[]; selectedBranchOverride?: string | null }) => <div><span>Graph commits: {commits.length}</span><span>Graph filter: {selectedBranchOverride ?? "all"}</span></div>,
}));

const commits: Commit[] = [
    { sha: "first", shortSha: "first", message: "First change", authorName: "Zoe", authorLogin: null, authorAvatar: null, date: "2026-01-01T12:00:00Z" },
    { sha: "second", shortSha: "second", message: "Second change", authorName: "Amy", authorLogin: null, authorAvatar: null, date: "2026-01-02T12:00:00Z" },
];

it("filters and sorts non-default branches without hiding the graph through an invisible search", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => commits });
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[
            { name: "main", sha: "first", isDefault: true },
            { name: "feature", sha: "second", isDefault: false },
        ]} />);
        fireEvent.click(screen.getByRole("button", { name: "feature" }));
        await screen.findByText("2 commits loaded for feature");
        expect(screen.getByRole("button", { name: "feature" })).toHaveAttribute("aria-pressed", "true");
        const firstCommit = screen.getByRole("button", { name: /First change/ });
        fireEvent.click(firstCommit);
        expect(firstCommit).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("First change")).toHaveClass("whitespace-pre-wrap", "break-words");
        expect(screen.getByText("First change")).not.toHaveClass("truncate");
        fireEvent.click(firstCommit);
        expect(screen.getByText("First change")).toHaveClass("truncate");
        fireEvent.change(screen.getByRole("combobox", { name: "Sort commits" }), { target: { value: "oldest" } });
        expect(screen.getAllByRole("button").filter((button) => button.textContent?.includes("change"))[0]).toHaveTextContent("First change");
        fireEvent.change(screen.getByRole("textbox", { name: "Search commits" }), { target: { value: "missing" } });
        await waitFor(() => expect(screen.getByText("No commits match your search.")).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Graph" }));
        expect(screen.getByText("Graph commits: 2")).toBeInTheDocument();
    } finally {
        global.fetch = originalFetch;
    }
});

it.each([true, false])("counts the pinned default exactly once when included in the source list: %s", async (includeDefault) => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => commits });
    const others = Array.from({ length: 7 }, (_, index) => ({ name: `feature-${index + 1}`, sha: "second", isDefault: false }));
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={includeDefault ? [{ name: "main", sha: "first", isDefault: false }, ...others] : others} />);
        const counts = () => screen.getByRole("status", { name: "Branch counts" });
        const loaded = includeDefault ? "8 loaded" : "7 loaded + default";
        expect(counts()).toHaveTextContent(`7 shown · ${loaded}`);
        expect(screen.getAllByRole("button", { name: "main default" })).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: /1 more/ }));
        expect(counts()).toHaveTextContent(`8 shown · ${loaded}`);
        fireEvent.change(screen.getByRole("textbox", { name: "Search other branches" }), { target: { value: "feature-7" } });
        expect(counts()).toHaveTextContent(`2 shown · ${loaded}`);
        fireEvent.click(screen.getByRole("button", { name: "feature-7" }));
        await screen.findByText("2 commits loaded for feature-7");
        fireEvent.change(screen.getByRole("textbox", { name: "Search other branches" }), { target: { value: "no-such-branch" } });
        expect(counts()).toHaveTextContent(`1 shown · ${loaded}`);
        expect(screen.getByText("No other branches match your search.")).toBeInTheDocument();
        expect(screen.getByText("2 commits loaded for feature-7")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear branch search" }));
        expect(counts()).toHaveTextContent(`8 shown · ${loaded}`);
        fireEvent.click(screen.getByRole("button", { name: "Graph" }));
        expect(counts()).toHaveTextContent(`7 shown · ${loaded}`);
        fireEvent.change(screen.getByRole("textbox", { name: "Search other branches" }), { target: { value: "feature-7" } });
        fireEvent.click(screen.getByRole("button", { name: "feature-7" }));
        expect(screen.getByText("Graph filter: feature-7")).toBeInTheDocument();
        expect(screen.getByText("Graph commits: 2")).toBeInTheDocument();
    } finally {
        global.fetch = originalFetch;
    }
});

it("keeps failed pagination counts neutral rather than claiming complete history", async () => {
    const originalFetch = global.fetch;
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock;
    try {
        const initial = Array.from({ length: 500 }, (_, index) => ({ ...commits[0], sha: `sha-${index}`, shortSha: String(index) }));
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={initial} branches={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "+100" }));
        await screen.findByText("500 commits loaded");
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("sha=main&per_page=100&page=6"), expect.objectContaining({ headers: {}, signal: expect.any(AbortSignal) }));
        expect(screen.queryByText(/All \d+ commits loaded/)).not.toBeInTheDocument();
    } finally {
        global.fetch = originalFetch;
        errorLog.mockRestore();
    }
});

it("uses the caller token to load private branch history", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_input, init) => {
        const authorized = (init?.headers as Record<string, string> | undefined)?.["x-github-token"] === "caller-test-only";
        return { ok: authorized, status: authorized ? 200 : 404, json: async () => commits } as Response;
    }) as typeof fetch;
    try {
        render(<BranchGraph owner="example" repo="private" defaultBranch="main" githubToken="caller-test-only" commits={commits} branches={[
            { name: "main", sha: "first", isDefault: true },
            { name: "private-feature", sha: "second", isDefault: false },
        ]} />);
        fireEvent.click(screen.getByRole("button", { name: "private-feature" }));
        await screen.findByText("2 commits loaded for private-feature");
    } finally {
        global.fetch = originalFetch;
    }
});

it.each([{ initial: [] }, { initial: commits }])("reports incomplete initial history without claiming it is complete", ({ initial }) => {
    render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={initial} commitsFetchError branches={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Commit history could not be fully loaded");
    expect(screen.queryByText(/All \d+ commits loaded/)).not.toBeInTheDocument();
    if (initial.length === 0) expect(screen.queryByText("No commits match your search.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
});

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const raceBranches = [{ name: "main", sha: "first", isDefault: true }, { name: "feature-a", sha: "a-head", isDefault: false }, { name: "feature-b", sha: "b-head", isDefault: false }];
const branchResponse = (message: string) => ({ ok: true, json: async () => [{ ...commits[0], sha: message, message }] });

it.each(["resolve", "reject"])("keeps branch B when aborted A later %ss", async outcome => {
    const originalFetch = global.fetch, errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const a = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn(url => String(url).includes("sha=feature-a") ? a.promise : Promise.resolve(branchResponse("CURRENT_B"))) as unknown as typeof fetch;
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); fireEvent.click(screen.getByRole("button", { name: "feature-b" }));
        await screen.findByText("CURRENT_B");
        await act(async () => outcome === "resolve" ? a.resolve(branchResponse("OBSOLETE_A")) : a.reject(new Error("Obsolete A failed")));
        expect(screen.getByText("CURRENT_B")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_A")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "feature-b" })).toHaveAttribute("aria-pressed", "true");
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(errorLog).not.toHaveBeenCalled();
    } finally { global.fetch = originalFetch; errorLog.mockRestore(); }
});

it("returns to default data immediately while a feature request is pending", async () => {
    const originalFetch = global.fetch, a = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn(() => a.promise) as unknown as typeof fetch;
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); fireEvent.click(screen.getByRole("button", { name: "main default" }));
        expect(screen.getByText("First change")).toBeInTheDocument(); expect(screen.queryByText(/Loading commits/)).not.toBeInTheDocument();
        await act(async () => a.resolve(branchResponse("OBSOLETE_FEATURE")));
        expect(screen.getByText("First change")).toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally { global.fetch = originalFetch; }
});

it("an old branch finally cannot end a newer branch's loading state", async () => {
    const originalFetch = global.fetch, a = deferred<ReturnType<typeof branchResponse>>(), b = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn(url => String(url).includes("sha=feature-a") ? a.promise : b.promise) as unknown as typeof fetch;
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); fireEvent.click(screen.getByRole("button", { name: "feature-b" }));
        await act(async () => a.resolve(branchResponse("OBSOLETE_A")));
        expect(screen.getByText("Loading commits for feature-b…")).toBeInTheDocument();
        await act(async () => b.resolve(branchResponse("CURRENT_B"))); await screen.findByText("CURRENT_B");
    } finally { global.fetch = originalFetch; }
});

it.each(["owner", "repo", "token", "head"])("discards old branch data and refetches for a changed %s", async context => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>(); let reads = 0;
    global.fetch = jest.fn(() => ++reads === 1 ? old.promise : Promise.resolve(branchResponse("CURRENT_CONTEXT"))) as unknown as typeof fetch;
    try {
        const ui = render(<BranchGraph owner="example" repo="repo" defaultBranch="main" githubToken="dummy-old" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        ui.rerender(<BranchGraph owner={context === "owner" ? "other" : "example"} repo={context === "repo" ? "other" : "repo"} defaultBranch="main" githubToken={context === "token" ? "dummy-new" : "dummy-old"} commits={commits} branches={context === "head" ? raceBranches.map(branch => branch.name === "feature-a" ? { ...branch, sha: "new-head" } : branch) : raceBranches} />);
        await screen.findByText("CURRENT_CONTEXT");
        await act(async () => old.resolve(branchResponse("OBSOLETE_CONTEXT")));
        expect(screen.getByText("CURRENT_CONTEXT")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_CONTEXT")).not.toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        if (context === "token") expect(jest.mocked(global.fetch).mock.calls[1][1]?.headers).toEqual({ "x-github-token": "dummy-new" });
    } finally { global.fetch = originalFetch; }
});

it("unmount/Strict Mode cleanup aborts only its own branch request", async () => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>(), parse = jest.fn(async () => commits);
    global.fetch = jest.fn(() => old.promise) as unknown as typeof fetch;
    try {
        const ui = render(<StrictMode><BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} /></StrictMode>);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); ui.unmount();
        await act(async () => old.resolve({ ok: true, json: parse }));
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true); expect(parse).not.toHaveBeenCalled();
    } finally { global.fetch = originalFetch; }
});

it.each(["more", "all"])("aborts obsolete %s pagination on context change and never appends its late page", async operation => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn().mockImplementationOnce(() => old.promise).mockResolvedValue({ ok: false, status: 503 });
    try {
        const initial = Array.from({ length: 500 }, (_, i) => ({ ...commits[0], sha: `sha-${i}`, message: `Old ${i}` }));
        const ui = render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={initial} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: operation === "more" ? "+100" : /Load all/ }));
        ui.rerender(<BranchGraph owner="example" repo="other" defaultBranch="main" commits={[{ ...commits[0], message: "NEW_DEFAULT" }]} branches={raceBranches} />);
        await act(async () => old.resolve({ ok: true, json: async () => Array.from({ length: 100 }, (_, i) => ({ ...commits[0], sha: `late-${i}`, message: "OBSOLETE_PAGE" })) }));
        expect(screen.getByText("NEW_DEFAULT")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_PAGE")).not.toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally { global.fetch = originalFetch; }
});

it("guards asynchronous JSON processing after A headers have arrived", async () => {
    const originalFetch = global.fetch, json = deferred<Commit[]>();
    global.fetch = jest.fn(url => Promise.resolve(String(url).includes("sha=feature-a") ? { ok: true, json: () => json.promise } : branchResponse("CURRENT_B"))) as unknown as typeof fetch;
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "feature-b" })); await screen.findByText("CURRENT_B");
        await act(async () => json.resolve([{ ...commits[0], message: "OBSOLETE_BODY" }]));
        expect(screen.getByText("CURRENT_B")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_BODY")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});

it("shows a current branch failure and retries on the existing branch control", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue(branchResponse("RECOVERED_BRANCH"));
    try {
        render(<BranchGraph owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load.*retry/);
        expect(screen.queryByText("No commits match your search.")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); await screen.findByText("RECOVERED_BRANCH");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});
