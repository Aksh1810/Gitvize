import { render, screen } from "@testing-library/react";
import TabNav from "@/components/dashboard/tab-nav";

it("reveals the selected view on initial load and when it changes", () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
        const { rerender } = render(<TabNav activeTab="branches" onTabChange={jest.fn()} />);
        expect(scrollIntoView.mock.instances[0]).toBe(screen.getByRole("button", { name: "Branches" }));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
        rerender(<TabNav activeTab="dependencies" onTabChange={jest.fn()} />);
        expect(scrollIntoView.mock.instances[1]).toBe(screen.getByRole("button", { name: "Dependencies" }));
    } finally {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
});
