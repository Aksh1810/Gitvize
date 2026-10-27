import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("sha=main&per_page=100&page=6"), { headers: {} });
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
