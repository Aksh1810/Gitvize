import { StrictMode, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BranchGraph from "@/components/diagrams/branch-graph";
import { createBranchHistory } from "@/lib/branch-history";
import type { Commit, HistoryPageResult, BranchHistory } from "@/types";

jest.mock("@/components/diagrams/commit-history-rail", () => ({
    __esModule: true,
    default: ({ commits, selectedBranchOverride }: { commits: Commit[]; selectedBranchOverride?: string | null }) => <div><span>Graph commits: {commits.length}</span><span>Graph filter: {selectedBranchOverride ?? "all"}</span></div>,
}));

const commits: Commit[] = [
    { sha: "first", shortSha: "first", message: "First change", authorName: "Zoe", authorLogin: null, authorAvatar: null, date: "2026-01-01T12:00:00Z" },
    { sha: "second", shortSha: "second", message: "Second change", authorName: "Amy", authorLogin: null, authorAvatar: null, date: "2026-01-02T12:00:00Z" },
];

const MAIN = "a".repeat(40), FEATURE_A = "b".repeat(40), FEATURE_B = "c".repeat(40), NEW_HEAD = "d".repeat(40);
const readyPage = (items: Commit[], headSha = FEATURE_A, page = 1, nextPage: number | null = null) => ({ status: "ready" as const, headSha, page, perPage: 100, commits: items, nextPage });
function initialHistory(items: Commit[], headSha = MAIN, failed = false) {
    const pages: Record<number, HistoryPageResult> = {};
    for (let offset = 0; offset < items.length; offset += 100) {
        const page = offset / 100 + 1, content = items.slice(offset, offset + 100);
        pages[page] = readyPage(content, headSha, page, content.length === 100 || failed ? page + 1 : null);
    }
    if (!items.length && !failed) pages[1] = readyPage([], headSha);
    if (failed) { const page = items.length ? Math.ceil(items.length / 100) + 1 : 1; pages[page] = { status: "error", page, perPage: 100, error: { status: 503, message: "Commit history could not be fully loaded. Retry this page." } }; }
    return createBranchHistory("main", headSha, pages);
}
function Subject(props: ComponentProps<typeof BranchGraph>) {
    const branches = props.branches.map(branch => ({ ...branch, headSha: branch.headSha ?? (/^[0-9a-f]{40}$/.test(branch.sha) ? branch.sha : branch.sha === "new-head" ? NEW_HEAD : branch.name === props.defaultBranch ? MAIN : branch.name === "feature-b" ? FEATURE_B : FEATURE_A) }));
    return <BranchGraph {...props} branches={branches} defaultHistory={props.defaultHistory ?? initialHistory(props.commits ?? [], props.snapshot?.status === "ready" ? props.snapshot.commitSha : MAIN, props.commitsFetchError)} />;
}
const responseFor = (url: unknown, items = commits) => ({ ok: true, status: 200, json: async () => readyPage(items, new URL(String(url), "http://localhost").searchParams.get("sha")!, Number(new URL(String(url), "http://localhost").searchParams.get("page"))) });

it("shows the history ceiling without hiding the loaded rows or claiming complete history", () => {
    const pages = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, { ...readyPage([commits[0]], MAIN, i + 1, i + 2), perPage: 1 }]));
    render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[]} defaultHistory={createBranchHistory("main", MAIN, pages, 1)} />);
    expect(screen.getByText(/history limited to 50 pages/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+100" })).toBeDisabled();
    expect(screen.getByText("First change")).toBeInTheDocument();
});
it("bounds each Load all pass, retains its rows, and leaves continuation available", async () => {
    const originalFetch = global.fetch;
    const initial = createBranchHistory("main", MAIN, { 1: { ...readyPage([commits[0]], MAIN, 1, 2), perPage: 1 } }, 1);
    global.fetch = jest.fn(async url => {
        const page = Number(new URL(String(url), "http://localhost").searchParams.get("page"));
        return { ok: true, status: 200, json: async () => ({ ...readyPage([{ ...commits[0], sha: `commit-${page}`, message: `PAGE_${page}` }], MAIN, page, page + 1), perPage: 1 }) };
    }) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[]} defaultHistory={initial} />);
        fireEvent.click(screen.getByRole("button", { name: "Load all" }));
        await screen.findByText("PAGE_11");
        await waitFor(() => expect(screen.getByRole("button", { name: "Load all" })).toBeEnabled());
        expect(global.fetch).toHaveBeenCalledTimes(10);
        expect(screen.getByText("First change")).toBeInTheDocument();
        expect(screen.getByText(/up to 10 more pages per pass/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "+100" })); await screen.findByText("PAGE_12");
        expect(global.fetch).toHaveBeenCalledTimes(11);
    } finally { global.fetch = originalFetch; }
});
it("preserves loaded history through repeated 429 errors and retries the same pinned page", async () => {
    const originalFetch = global.fetch;
    const initial = createBranchHistory("main", MAIN, { 1: readyPage([commits[0]], MAIN, 1, 2) });
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: "GitHub rate limit reached. Retry later." }) }).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: "GitHub rate limit reached. Retry later." }) }).mockResolvedValue({ ok: true, status: 200, json: async () => readyPage([commits[0], commits[1]], MAIN, 2) });
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[]} defaultHistory={initial} />);
        fireEvent.click(screen.getByRole("button", { name: "+100" })); await screen.findByRole("alert");
        expect(screen.getByText("First change")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry history page 2" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Retry history page 2" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Retry history page 2" })); await screen.findByText("Second change");
        expect(screen.getAllByText("First change")).toHaveLength(1);
        expect(jest.mocked(global.fetch).mock.calls.map(([url]) => new URL(String(url), "http://localhost").searchParams.get("page"))).toEqual(["2", "2", "2"]);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});
it("ends only on a valid empty final page and keeps earlier commits visible", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => readyPage([], MAIN, 2) });
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[]} defaultHistory={createBranchHistory("main", MAIN, { 1: readyPage([commits[0]], MAIN, 1, 2) })} />);
        fireEvent.click(screen.getByRole("button", { name: "+100" }));
        await screen.findByText("1 commits loaded");
        expect(screen.queryByRole("button", { name: "+100" })).not.toBeInTheDocument();
        expect(screen.getByText("First change")).toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});
it("retains compatible feature pages when returning from default after cancelled pagination", async () => {
    const originalFetch = global.fetch, pending = deferred<ReturnType<typeof branchResponse>>(); let reads = 0;
    global.fetch = jest.fn(async url => {
        if (++reads === 2) return pending.promise;
        const page = Number(new URL(String(url), "http://localhost").searchParams.get("page"));
        return { ok: true, status: 200, json: async () => readyPage([{ ...commits[0], sha: `feature-${page}`, message: page === 1 ? "RETAINED_FEATURE" : "NEW_PAGE" }], FEATURE_A, page, page === 1 ? 2 : null) };
    }) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); await screen.findByText("RETAINED_FEATURE");
        fireEvent.click(screen.getByRole("button", { name: "+100" }));
        fireEvent.click(screen.getByRole("button", { name: "main default" }));
        await act(async () => pending.resolve(branchResponse("OBSOLETE_PAGE")));
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        expect(screen.getByText("RETAINED_FEATURE")).toBeInTheDocument(); expect(global.fetch).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "+100" })); await screen.findByText("NEW_PAGE");
        expect(screen.queryByText("OBSOLETE_PAGE")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});
it("owns the initial history request across Strict Mode setup/cleanup even when abort is ignored", async () => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>(); let reads = 0;
    global.fetch = jest.fn(() => ++reads === 1 ? old.promise : Promise.resolve(branchResponse("CURRENT_STRICT_HISTORY", MAIN))) as unknown as typeof fetch;
    try {
        render(<StrictMode><BranchGraph owner="example" repo="repo" defaultBranch="main" branches={[]} graphCommits={[]} defaultHistory={createBranchHistory("main", MAIN)} /></StrictMode>);
        await screen.findByText("CURRENT_STRICT_HISTORY");
        await act(async () => old.resolve(branchResponse("OBSOLETE_STRICT_HISTORY", MAIN)));
        expect(screen.queryByText("OBSOLETE_STRICT_HISTORY")).not.toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(jest.mocked(global.fetch).mock.calls[1][1]?.signal?.aborted).toBe(false);
    } finally { global.fetch = originalFetch; }
});

it("keeps a feature-only commit in the graph but out of the default history list", () => {
    const headSha = "a".repeat(40), feature = { ...commits[0], sha: "feature-only", message: "FEATURE_ONLY" };
    const defaultHistory: BranchHistory = { branch: "main", headSha, perPage: 100, pages: { 1: { status: "ready", headSha, page: 1, perPage: 100, commits, nextPage: null } }, nextPage: null, complete: true, cutoff: false, error: null };
    render(<Subject owner="example" repo="repo" defaultBranch="main" commits={[...commits, feature]} defaultHistory={defaultHistory} branches={[]} />);
    expect(screen.queryByText("FEATURE_ONLY")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByText("Graph commits: 3")).toBeInTheDocument();
});

it("keeps later successful pages visible and repairs the earliest gap before advancing", async () => {
    const originalFetch = global.fetch, headSha = "a".repeat(40);
    const page = (n: number) => ({ status: "ready" as const, headSha, page: n, perPage: 100, commits: [{ ...commits[0], sha: `page-${n}`, message: `PAGE_${n}` }], nextPage: n + 1 });
    const defaultHistory: BranchHistory = { branch: "main", headSha, perPage: 100, pages: { 1: page(1), 2: { status: "error" as const, page: 2, perPage: 100, error: { status: 503, message: "Temporary outage" } }, 3: page(3), 4: page(4), 5: page(5) }, nextPage: 2, complete: false, cutoff: false, error: { status: 503, message: "Temporary outage" } };
    global.fetch = jest.fn(async url => ({ ok: true, status: 200, json: async () => page(Number(new URL(String(url), "http://localhost").searchParams.get("page"))) })) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={[...page(1).commits, ...page(3).commits, ...page(4).commits, ...page(5).commits]} defaultHistory={defaultHistory} branches={[]} />);
        expect(screen.getByText("PAGE_5")).toBeInTheDocument();
        expect(screen.getByText("Retry page 2")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Retry.*page 2/i }));
        await screen.findByText("PAGE_2"); expect(screen.getByText("PAGE_5")).toBeInTheDocument();
        const url = new URL(String(jest.mocked(global.fetch).mock.calls[0][0]), "http://localhost");
        expect(url.searchParams.get("sha")).toBe(headSha); expect(url.searchParams.get("page")).toBe("2");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "+100" }));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
        expect(new URL(String(jest.mocked(global.fetch).mock.calls[1][0]), "http://localhost").searchParams.get("page")).toBe("6");
    } finally { global.fetch = originalFetch; }
});
it("distinguishes a valid empty captured history from failed or filtered history", () => {
    render(<Subject owner="example" repo="repo" defaultBranch="main" commits={[]} branches={[]} defaultHistory={createBranchHistory("main", MAIN, { 1: readyPage([], MAIN) })} />);
    expect(screen.getByText("No commits in this captured history.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("filters and sorts non-default branches without hiding the graph through an invisible search", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async url => responseFor(url)) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[
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
    global.fetch = jest.fn(async url => responseFor(url)) as unknown as typeof fetch;
    const others = Array.from({ length: 7 }, (_, index) => ({ name: `feature-${index + 1}`, sha: "second", isDefault: false }));
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={includeDefault ? [{ name: "main", sha: "first", isDefault: false }, ...others] : others} />);
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
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Could not load this branch history; select it again to retry." }) });
    global.fetch = fetchMock;
    try {
        const initial = Array.from({ length: 500 }, (_, index) => ({ ...commits[0], sha: `sha-${index}`, shortSha: String(index) }));
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={initial} branches={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "+100" }));
        await screen.findByText(/500 loaded on/);
        expect(await screen.findByRole("button", { name: "Retry history page 6" })).toBeEnabled();
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`sha=${MAIN}&per_page=100&page=6`), expect.objectContaining({ headers: {}, signal: expect.any(AbortSignal) }));
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
        return { ok: authorized, status: authorized ? 200 : 404, json: async () => readyPage(commits, FEATURE_A) } as Response;
    }) as typeof fetch;
    try {
        render(<Subject owner="example" repo="private" defaultBranch="main" githubToken="caller-test-only" commits={commits} branches={[
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
    render(<Subject owner="example" repo="repo" defaultBranch="main" commits={initial} commitsFetchError branches={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Commit history could not be fully loaded");
    expect(screen.queryByText(/All \d+ commits loaded/)).not.toBeInTheDocument();
    if (initial.length === 0) expect(screen.queryByText("No commits match your search.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
});

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const raceBranches = [{ name: "main", sha: "first", isDefault: true }, { name: "feature-a", sha: "a-head", isDefault: false }, { name: "feature-b", sha: "b-head", isDefault: false }];
const branchResponse = (message: string, headSha = FEATURE_A) => ({ ok: true, status: 200, json: async () => readyPage([{ ...commits[0], sha: message, message }], headSha) });

it.each(["resolve", "reject"])("keeps branch B when aborted A later %ss", async outcome => {
    const originalFetch = global.fetch, errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const a = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn(url => String(url).includes(`sha=${FEATURE_A}`) ? a.promise : Promise.resolve(branchResponse("CURRENT_B", FEATURE_B))) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
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
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); fireEvent.click(screen.getByRole("button", { name: "main default" }));
        expect(screen.getByText("First change")).toBeInTheDocument(); expect(screen.queryByText(/Loading commits/)).not.toBeInTheDocument();
        await act(async () => a.resolve(branchResponse("OBSOLETE_FEATURE")));
        expect(screen.getByText("First change")).toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally { global.fetch = originalFetch; }
});

it("an old branch finally cannot end a newer branch's loading state", async () => {
    const originalFetch = global.fetch, a = deferred<ReturnType<typeof branchResponse>>(), b = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn(url => String(url).includes(`sha=${FEATURE_A}`) ? a.promise : b.promise) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); fireEvent.click(screen.getByRole("button", { name: "feature-b" }));
        await act(async () => a.resolve(branchResponse("OBSOLETE_A")));
        expect(screen.getByText("Loading commits for feature-b…")).toBeInTheDocument();
        await act(async () => b.resolve(branchResponse("CURRENT_B", FEATURE_B))); await screen.findByText("CURRENT_B");
    } finally { global.fetch = originalFetch; }
});

it.each(["owner", "repo", "token", "head"])("discards old branch data and refetches for a changed %s", async context => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>(); let reads = 0;
    global.fetch = jest.fn(url => ++reads === 1 ? old.promise : Promise.resolve(branchResponse("CURRENT_CONTEXT", new URL(String(url), "http://localhost").searchParams.get("sha")!))) as unknown as typeof fetch;
    try {
        const ui = render(<Subject owner="example" repo="repo" defaultBranch="main" githubToken="dummy-old" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        ui.rerender(<Subject owner={context === "owner" ? "other" : "example"} repo={context === "repo" ? "other" : "repo"} defaultBranch="main" githubToken={context === "token" ? "dummy-new" : "dummy-old"} commits={commits} branches={context === "head" ? raceBranches.map(branch => branch.name === "feature-a" ? { ...branch, sha: "new-head" } : branch) : raceBranches} />);
        await screen.findByText("CURRENT_CONTEXT");
        await act(async () => old.resolve(branchResponse("OBSOLETE_CONTEXT")));
        expect(screen.getByText("CURRENT_CONTEXT")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_CONTEXT")).not.toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        if (context === "token") expect(jest.mocked(global.fetch).mock.calls[1][1]?.headers).toEqual({ "x-github-token": "dummy-new" });
    } finally { global.fetch = originalFetch; }
});

it("unmount/Strict Mode cleanup aborts only its own branch request", async () => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>(), parse = jest.fn(async () => readyPage(commits, FEATURE_A));
    global.fetch = jest.fn(() => old.promise) as unknown as typeof fetch;
    try {
        const ui = render(<StrictMode><Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} /></StrictMode>);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); ui.unmount();
        await act(async () => old.resolve({ ok: true, status: 200, json: parse }));
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true); expect(parse).not.toHaveBeenCalled();
    } finally { global.fetch = originalFetch; }
});

it.each(["more", "all"])("aborts obsolete %s pagination on context change and never appends its late page", async operation => {
    const originalFetch = global.fetch, old = deferred<ReturnType<typeof branchResponse>>();
    global.fetch = jest.fn().mockImplementationOnce(() => old.promise).mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Could not load this branch history; select it again to retry." }) });
    try {
        const initial = Array.from({ length: 500 }, (_, i) => ({ ...commits[0], sha: `sha-${i}`, message: `Old ${i}` }));
        const ui = render(<Subject owner="example" repo="repo" defaultBranch="main" commits={initial} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: operation === "more" ? "+100" : /Load all/ }));
        ui.rerender(<Subject owner="example" repo="other" defaultBranch="main" commits={[{ ...commits[0], message: "NEW_DEFAULT" }]} branches={raceBranches} />);
        await act(async () => old.resolve({ ok: true, status: 200, json: async () => readyPage(Array.from({ length: 100 }, (_, i) => ({ ...commits[0], sha: `late-${i}`, message: "OBSOLETE_PAGE" })), MAIN, 6) }));
        expect(screen.getByText("NEW_DEFAULT")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_PAGE")).not.toBeInTheDocument();
        expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally { global.fetch = originalFetch; }
});

it("guards asynchronous JSON processing after A headers have arrived", async () => {
    const originalFetch = global.fetch, json = deferred<ReturnType<typeof readyPage>>();
    global.fetch = jest.fn(url => Promise.resolve(String(url).includes(`sha=${FEATURE_A}`) ? { ok: true, json: () => json.promise } : branchResponse("CURRENT_B", FEATURE_B))) as unknown as typeof fetch;
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "feature-b" })); await screen.findByText("CURRENT_B");
        await act(async () => json.resolve(readyPage([{ ...commits[0], message: "OBSOLETE_BODY" }], FEATURE_A)));
        expect(screen.getByText("CURRENT_B")).toBeInTheDocument(); expect(screen.queryByText("OBSOLETE_BODY")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});

it("shows a current branch failure and retries on the existing branch control", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Could not load this branch history; select it again to retry." }) }).mockResolvedValue(branchResponse("RECOVERED_BRANCH"));
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load.*retry/);
        expect(screen.queryByText("No commits match your search.")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "feature-a" })); await screen.findByText("RECOVERED_BRANCH");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally { global.fetch = originalFetch; }
});

it("owns branch responses by code snapshot even when all branch/tree inputs are unchanged", async () => {
    const originalFetch = global.fetch, pending = deferred<ReturnType<typeof branchResponse>>(); let calls = 0;
    const snapshotA = { schemaVersion: 1, owner: "example", repo: "repo", defaultBranch: "main", selectedBranch: "main", capturedAt: "2026-10-30T12:00:00.000Z", visibility: "public", status: "ready", commitSha: "a".repeat(40), treeSha: "c".repeat(40) } as const;
    global.fetch = jest.fn(() => ++calls === 1 ? pending.promise : Promise.resolve(branchResponse("CURRENT_SNAPSHOT"))) as unknown as typeof fetch;
    try {
        const ui = render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} snapshot={snapshotA} />);
        fireEvent.click(screen.getByRole("button", { name: "feature-a" }));
        ui.rerender(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={raceBranches} snapshot={{ ...snapshotA, commitSha: "b".repeat(40) }} />);
        await screen.findByText("CURRENT_SNAPSHOT"); await act(async () => pending.resolve(branchResponse("OLD_SNAPSHOT")));
        expect(screen.queryByText("OLD_SNAPSHOT")).not.toBeInTheDocument(); expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally { global.fetch = originalFetch; }
});

it("requests a selected branch's captured head rather than its advancing name", async () => {
    const originalFetch = global.fetch, headSha = "b".repeat(40);
    global.fetch = jest.fn().mockResolvedValue(branchResponse("CAPTURED_BRANCH_HEAD", headSha));
    try {
        render(<Subject owner="example" repo="repo" defaultBranch="main" commits={commits} branches={[{ name: "feature/正常", sha: headSha, headSha, capturedAt: "2026-10-30T12:00:00.000Z", isDefault: false }]} />);
        fireEvent.click(screen.getByRole("button", { name: "feature/正常" })); await screen.findByText("CAPTURED_BRANCH_HEAD");
        const url = new URL(String(jest.mocked(global.fetch).mock.calls[0][0]), "http://localhost");
        expect(url.searchParams.get("sha")).toBe(headSha);
    } finally { global.fetch = originalFetch; }
});
