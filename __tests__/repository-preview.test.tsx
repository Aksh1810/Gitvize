import { fireEvent, render, screen, within } from "@testing-library/react";
import RepositoryPreview from "@/components/dashboard/repository-preview";

it("lets a visitor inspect a different demo file", () => {
    render(<RepositoryPreview />);
    expect(screen.getByRole("heading", { name: "page.tsx" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "lib github.ts" }));
    expect(screen.getByRole("heading", { name: "github.ts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "lib github.ts" })).toHaveAttribute("aria-pressed", "true");
});

it("keeps explorer and node selections in sync without fetching repository data", () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    try {
        render(<RepositoryPreview />);
        const inspector = screen.getByRole("complementary", { name: "Demo file inspector" });
        expect(inspector).toHaveAttribute("aria-live", "polite");
        for (const [folder, name] of [["components", "Map.tsx"], ["lib", "github.ts"], ["app", "page.tsx"]]) {
            fireEvent.click(screen.getByRole("button", { name }));
            expect(within(inspector).getByRole("heading", { name })).toBeInTheDocument();
            expect(within(inspector).getByText(`${folder}/${name}`)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: `${folder} ${name}` })).toHaveAttribute("aria-pressed", "true");
            expect(within(inspector).getByLabelText(`${name} illustrative code`)).toHaveAttribute("tabindex", "0");
        }
        fireEvent.click(screen.getByRole("button", { name: "lib github.ts" }));
        expect(screen.getByRole("button", { name: "github.ts" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "page.tsx" })).toHaveAttribute("aria-pressed", "false");
        expect(fetchMock).not.toHaveBeenCalled();
    } finally {
        global.fetch = originalFetch;
    }
});
