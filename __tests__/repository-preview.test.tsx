import { fireEvent, render, screen } from "@testing-library/react";
import RepositoryPreview from "@/components/dashboard/repository-preview";

it("lets a visitor inspect a different demo file", () => {
    render(<RepositoryPreview />);
    expect(screen.getByRole("heading", { name: "page.tsx" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "lib github.ts" }));
    expect(screen.getByRole("heading", { name: "github.ts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "lib github.ts" })).toHaveAttribute("aria-pressed", "true");
});
