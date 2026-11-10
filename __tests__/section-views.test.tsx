import { render, screen, fireEvent } from "@testing-library/react";
import DependencyGraph from "@/components/diagrams/dependency-graph";
import ContributorsNetwork from "@/components/diagrams/contributors-network";
import BranchGraph from "@/components/diagrams/branch-graph";
import { parseDependencySection } from "@/lib/dep-parser";
import { createBranchHistory } from "@/lib/branch-history";

jest.mock("@/components/diagrams/commit-history-rail", () => ({ __esModule: true, default: () => <div>Rail fixture</div> }));
const failure = { code: "upstream" as const, status: 503, message: "Dependency manifests could not be loaded; try again." };
it("shows unavailable dependencies rather than successful emptiness", () => {
    render(<DependencyGraph dependencies={[]} section={{ status: "error", error: failure }} />);
    expect(screen.getByRole("status")).toHaveTextContent(/could not be loaded/);
    expect(screen.queryByText(/No dependency data found/)).not.toBeInTheDocument();
});
it("distinguishes confirmed missing manifests, unsupported parsing, malformed JSON and pending", () => {
    expect(parseDependencySection({ status: "ready", data: [] })).toEqual({ status: "ready", data: [] });
    expect(parseDependencySection({ status: "ready", data: [{ filename: "Gemfile", content: "gem 'rails'" }] })).toMatchObject({ status: "unsupported", error: { code: "unsupported" } });
    expect(parseDependencySection({ status: "ready", data: [{ filename: "package.json", content: "{broken" }] })).toMatchObject({ status: "error", error: { code: "parse_error" } });
    expect(parseDependencySection({ status: "pending" })).toEqual({ status: "pending" });
});
it("retains usable dependencies alongside unavailable or unsupported sibling manifests", () => {
    const section = parseDependencySection({ status: "partial", data: [{ filename: "requirements.txt", content: "requests==2" }, { filename: "pom.xml", content: "<project/>" }], errors: [failure] });
    expect(section).toMatchObject({ status: "partial", data: [{ name: "requests" }], errors: expect.arrayContaining([failure, expect.objectContaining({ code: "unsupported" })]) });
    render(<DependencyGraph dependencies={section.status === "partial" ? section.data : []} section={section} />);
    expect(screen.getByText("requests")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/could not be loaded/);
});
it("keeps loaded contributor rows and a stable partial announcement through sorting/search rerenders", async () => {
    const people = [{ login: "fixture-person", id: 1, avatarUrl: "", contributions: 3, htmlUrl: "https://github.com/fixture-person" }];
    const section = { status: "partial" as const, data: people, errors: [{ ...failure, message: "A contributor page could not be loaded; available people are shown." }] };
    const ui = render(<ContributorsNetwork contributors={people} section={section} />);
    const status = screen.getByRole("status");
    expect(screen.getByRole("link", { name: /fixture-person/ })).toBeInTheDocument();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver(records => mutations.push(...records)); observer.observe(status, { childList: true, characterData: true, subtree: true });
    fireEvent.change(screen.getByLabelText("Sort contributors"), { target: { value: "name" } });
    ui.rerender(<ContributorsNetwork contributors={[...people]} section={{ ...section, data: [...people] }} />);
    await Promise.resolve(); observer.disconnect();
    expect(screen.getByRole("status")).toBe(status); expect(mutations).toHaveLength(0);
    expect(status).toHaveTextContent(/available people are shown/);
});
it("separates unavailable branch enumeration from a true empty captured history", () => {
    render(<BranchGraph owner="example" repo="fixture" branches={[]} defaultBranch="main" defaultHistory={createBranchHistory("main", null)} branchSection={{ status: "error", error: { ...failure, message: "Branch list could not be loaded; try again." } }} />);
    expect(screen.getByText(/Branch list could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /main.*default/i })).toBeInTheDocument();
});

it("labels confirmed absent manifests separately from a parsed manifest with zero dependencies", () => {
    const ui = render(<DependencyGraph dependencies={[]} section={{ status: "ready", data: [] }} manifestCount={0} />);
    expect(screen.getByText(/No root dependency manifests found/)).toBeInTheDocument();
    ui.rerender(<DependencyGraph dependencies={[]} section={{ status: "ready", data: [] }} manifestCount={1} />);
    expect(screen.getByText(/No dependencies found in the loaded root manifests/)).toBeInTheDocument();
});

it("presents pending and unsupported parsing as states, not empty dependencies", () => {
    const ui = render(<DependencyGraph dependencies={[]} section={{ status: "pending" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Dependencies pending.");
    ui.rerender(<DependencyGraph dependencies={[]} section={parseDependencySection({ status: "ready", data: [{ filename: "Gemfile", content: "gem 'rails'" }] })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Gemfile.*unsupported/);
    expect(screen.queryByText(/No dependencies found/)).not.toBeInTheDocument();
});
