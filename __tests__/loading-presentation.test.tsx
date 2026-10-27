import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CloneProgressScreen from "@/components/dashboard/clone-progress-screen";
import PipelineStatusDisplay from "@/components/dashboard/pipeline-status";
import type { PipelineStatus, PipelineStep } from "@/types";

const stepKeys: PipelineStep[] = ["ingest", "understand", "enrich"];

it.each<{ statuses: PipelineStatus[]; summary: string }>([
    { statuses: [], summary: "Waiting for analysis" },
    { statuses: ["pending", "pending", "pending"], summary: "Waiting for analysis" },
    { statuses: ["complete", "pending", "pending"], summary: "Waiting for analysis" },
    { statuses: ["complete", "running", "pending"], summary: "Analysis in progress" },
    { statuses: ["complete", "complete", "complete"], summary: "Analysis complete" },
    { statuses: ["complete", "error", "pending"], summary: "Analysis needs attention" },
    { statuses: ["running", "error", "pending"], summary: "Analysis needs attention" },
])("announces $summary for $statuses without claiming unsupported completion", ({ statuses, summary }) => {
    const message = "Upstream quota/network detail remains available in full.";
    render(<PipelineStatusDisplay steps={statuses.map((status, i) => ({ step: stepKeys[i], status, message }))} />);
    expect(screen.getByRole("status")).toHaveTextContent(summary);
    const rows = within(screen.getByRole("list", { name: "Analysis steps" })).queryAllByRole("listitem");
    expect(rows).toHaveLength(statuses.length);
    const labels = { pending: "Waiting", running: "In progress", complete: "Complete", error: "Failed" };
    rows.forEach((row, i) => {
        expect(within(row).getByText(labels[statuses[i]], { exact: true })).toBeInTheDocument();
        expect(within(row).getByText(message)).toBeInTheDocument();
        if (statuses[i] === "running") expect(row).toHaveAttribute("aria-current", "step");
        else expect(row).not.toHaveAttribute("aria-current");
    });
});

it("keeps repository progress, waiting steps and completion accessible", async () => {
    const identity = { owner: "a-long-repository-owner", repo: "a-long-repository-name-for-readable-loading" };
    const { rerender, container } = render(<CloneProgressScreen {...identity} currentStep="metadata" message="Fetching repository details from the available source." />);
    expect(screen.getByText(`${identity.owner}/${identity.repo}`)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Fetching repository details from the available source.");
    const rows = within(screen.getByRole("list", { name: "Repository loading steps" })).getAllByRole("listitem");
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    expect(within(rows[0]).getByText("Complete")).toBeInTheDocument();
    expect(within(rows[1]).getByText("In progress")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Waiting")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    rerender(<CloneProgressScreen {...identity} currentStep="done" message="" />);
    expect(screen.getByRole("heading", { name: "Repository ready" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Repository data is ready."));
    expect(screen.getAllByText("Complete", { exact: true })).toHaveLength(5);
    expect(container.querySelector('[aria-current="step"]')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="false"]')).toBeInTheDocument();
});

it("preserves the exact failure, retry callback and navigation destination", () => {
    const onRetry = jest.fn();
    const error = "GitHub API rate limit reached. Try again after the quota resets.";
    const { rerender } = render(<CloneProgressScreen owner="example" repo="repository" currentStep="error" message="" error={error} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore another repository" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<CloneProgressScreen owner="example" repo="repository" currentStep="checking" message="Checking repository access." />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking repository access.");
});
