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
    expect(screen.getByRole("status")).toHaveTextContent("Connecting…");
    expect(screen.getByLabelText("Personal Access Token")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("preserves the token and shows validation errors for retry", async () => {
    const onOpenChange = jest.fn();
    const message = "Check repository permissions. Local verification fixture detail: a-long-upstream-reference-that-must-remain-available-without-truncating-the-original-error-message.";
    const onSave = jest.fn().mockRejectedValue(new Error(message));
    render(<GitHubTokenModal open onOpenChange={onOpenChange} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Personal Access Token"), { target: { value: "test-token-value-for-ui-only" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Personal Access Token")).toHaveValue("test-token-value-for-ui-only");
    expect(screen.getByLabelText("Personal Access Token")).toHaveAttribute("aria-describedby", "github-token-help github-token-error");
    expect(screen.getByLabelText("Personal Access Token")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
});

it("keeps length validation, reveal and cancel reset accessible", () => {
    const onOpenChange = jest.fn();
    const onSave = jest.fn();
    render(<GitHubTokenModal open onOpenChange={onOpenChange} onSave={onSave} />);
    const input = screen.getByLabelText("Personal Access Token");
    fireEvent.change(input, { target: { value: "short" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "github-token-help");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Show token" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide token" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(onSave).not.toHaveBeenCalled();
});
