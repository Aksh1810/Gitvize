import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BranchGraph from "@/components/diagrams/branch-graph";
import type { Commit } from "@/types";

jest.mock("@/components/diagrams/commit-history-rail", () => ({
    __esModule: true,
    default: ({ commits }: { commits: Commit[] }) => <div>Graph commits: {commits.length}</div>,
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
