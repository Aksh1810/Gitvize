import { fireEvent, render, screen } from "@testing-library/react";
import AISettingsModal, { loadAISettings } from "@/components/dashboard/ai-settings-modal";
import { toast } from "sonner";

jest.mock("sonner", () => ({ toast: { info: jest.fn() } }));
const storageKey = "gitvize_ai_settings";
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

it.each([
    ["anthropic", "claude-3-5-sonnet-20241022", "claude-sonnet-4-6"],
    ["gemini", "gemini-2.0-flash", "gemini-2.5-flash"],
])("migrates only the retired %s saved default while retaining its provider and key", (provider, model, replacement) => {
    sessionStorage.setItem(storageKey, JSON.stringify({ provider, model, apiKey: "saved-fixture-only" }));
    expect(loadAISettings()).toEqual({ provider, model: replacement, apiKey: "saved-fixture-only" });
    expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual({ provider, model: replacement, apiKey: "saved-fixture-only" });
    const onSave = jest.fn();
    render(<AISettingsModal open onOpenChange={() => {}} onSave={onSave} />);
    expect(screen.getByRole("status")).toHaveTextContent(replacement);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(onSave).toHaveBeenCalledWith({ provider, model: replacement, apiKey: "saved-fixture-only" });
    expect(toast.info).toHaveBeenCalledWith("Saved AI model updated", expect.objectContaining({ description: expect.stringContaining(replacement) }));
    expect(JSON.stringify(jest.mocked(toast.info).mock.calls)).not.toContain("saved-fixture-only");
});

it.each(["gpt-4o-mini", "gpt-4o-2024-11-20", "custom-explicit-model"])("preserves an explicit saved model %s on load and save", model => {
    const saved = { provider: "openai", model, apiKey: "sk-fixture-only-for-tests" };
    sessionStorage.setItem(storageKey, JSON.stringify(saved));
    expect(loadAISettings()).toEqual(saved);
    const onSave = jest.fn();
    render(<AISettingsModal open onOpenChange={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(onSave).toHaveBeenCalledWith(saved);
    expect(toast.info).not.toHaveBeenCalled();
});

it("uses the supported Sonnet default for a new key without claiming model access", () => {
    const onSave = jest.fn();
    render(<AISettingsModal open onOpenChange={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-ant-fixture-only-for-tests" } });
    expect(screen.getByRole("status")).toHaveTextContent("claude-sonnet-4-6");
    expect(screen.getByText(/saving does not verify provider access/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(onSave).toHaveBeenCalledWith({ provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "sk-ant-fixture-only-for-tests" });
});
