import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GitHubTokenModal from "@/components/dashboard/github-token-modal";

it("keeps the dialog open while verifying, then closes after success", async () => {
    let finish: () => void = () => {};
    const onSave = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onOpenChange = jest.fn();
    render(<GitHubTokenModal open onOpenChange={onOpenChange} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Personal Access Token"), { target: { value: "test-token-value-for-ui-only" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("preserves the token and shows validation errors for retry", async () => {
    const onOpenChange = jest.fn();
    const onSave = jest.fn().mockRejectedValue(new Error("Check repository permissions."));
    render(<GitHubTokenModal open onOpenChange={onOpenChange} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Personal Access Token"), { target: { value: "test-token-value-for-ui-only" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check repository permissions.");
    expect(screen.getByLabelText("Personal Access Token")).toHaveValue("test-token-value-for-ui-only");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
});
