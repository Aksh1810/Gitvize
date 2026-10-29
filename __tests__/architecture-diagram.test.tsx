import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ArchitectureDiagram from "@/components/diagrams/architecture-diagram";
import { generateArchitectureMermaid, generateArchitectureOverview } from "@/lib/mermaid-generator";
import type { TreeItem } from "@/types";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/mermaid-generator", () => ({
    generateArchitectureOverview: jest.fn(() => "overview fixture"),
    generateArchitectureMermaid: jest.fn(() => "key files fixture"),
}));
jest.mock("@/components/diagrams/mermaid-diagram", () => ({
    __esModule: true,
    default: ({ code, viewControls }: { code: string; viewControls?: ReactNode }) => <div>{viewControls}<pre aria-label="Mermaid code">{code}</pre></div>,
}));

const tree: TreeItem[] = [{ path: "src/index.ts", mode: "100644", type: "blob", sha: "fixture", url: "" }];

it.each([undefined, "ai"] as const)("keeps the visible cue, pressed state and diagram in sync with initial source %s", source => {
    render(<ArchitectureDiagram analysis={null} owner="example" repo="repository" defaultBranch="main" tree={tree} source={source} />);
    const overview = screen.getByRole("button", { name: "Overview" });
    const files = screen.getByRole("button", { name: "Key files" });
    const assertSelection = (active: HTMLElement, inactive: HTMLElement, code: string) => {
        expect(active).toHaveAttribute("aria-pressed", "true");
        expect(inactive).toHaveAttribute("aria-pressed", "false");
        const cue = within(active).getByText("Selected");
        expect(cue).toBeVisible();
        expect(cue).toHaveAttribute("aria-hidden", "true");
        expect(cue.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
        expect(within(inactive).getByText("Selected")).not.toBeVisible();
        expect(screen.getByLabelText("Mermaid code")).toHaveTextContent(code);
        expect(overview).toHaveAccessibleName("Overview");
        expect(files).toHaveAccessibleName("Key files");
    };
    const startsWithFiles = source === "ai";
    assertSelection(startsWithFiles ? files : overview, startsWithFiles ? overview : files, startsWithFiles ? "key files fixture" : "overview fixture");
    fireEvent.click(startsWithFiles ? overview : files);
    assertSelection(startsWithFiles ? overview : files, startsWithFiles ? files : overview, startsWithFiles ? "overview fixture" : "key files fixture");
    fireEvent.click(startsWithFiles ? files : overview);
    assertSelection(startsWithFiles ? files : overview, startsWithFiles ? overview : files, startsWithFiles ? "key files fixture" : "overview fixture");
    expect(generateArchitectureOverview).toHaveBeenCalledWith(tree);
    expect(generateArchitectureMermaid).toHaveBeenCalledWith(null, tree, "example", "repository", "main");
});
