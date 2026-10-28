import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RepoOnboardingGuide from "@/components/dashboard/repo-onboarding-guide";
import AISettingsModal, { type AISettings } from "@/components/dashboard/ai-settings-modal";

function HelpExample({ activeTab = "files" }: { activeTab?: string }) {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Help</button><RepoOnboardingGuide open={open} activeTab={activeTab} onClose={() => setOpen(false)} /></>;
}

it("restores focus to the opening button after Escape without a Radix trigger", async () => {
    render(<HelpExample />);
    const opener = screen.getByRole("button", { name: "Help" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
});

it.each([ ["files", 5], ["architecture", 3], ["contributors", 4], ["branches", 4], ["dependencies", 5] ] as const)("keeps the %s Help group and close callback available", async (activeTab, count) => {
    render(<HelpExample activeTab={activeTab} />);
    const opener = screen.getByRole("button", { name: "Help" });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole("dialog", { name: `Explore ${activeTab}` })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(count);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(opener).toHaveFocus());
});

function AIExample({ onSave }: { onSave: (settings: AISettings) => void }) {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>AI settings</button><AISettingsModal open={open} onOpenChange={setOpen} onSave={onSave} /></>;
}

describe("AI settings presentation preserves session and inference behavior", () => {
    beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
    afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

    it.each([
        ["AIza-ui-fixture-only-not-a-real-key", "gemini", "gemini-2.5-flash"],
        ["sk-ant-ui-fixture-only-not-a-real-key", "anthropic", "claude-3-5-sonnet-20241022"],
        ["sk-ui-fixture-only-not-a-real-key", "openai", "gpt-4o-mini"],
    ])("saves inferred %s settings for this tab and clears them on request", async (apiKey, provider, model) => {
        const onSave = jest.fn();
        render(<AIExample onSave={onSave} />);
        const opener = screen.getByRole("button", { name: "AI settings" });
        opener.focus();
        fireEvent.click(opener);
        await waitFor(() => expect(screen.getByLabelText("API Key")).toHaveFocus());
        const input = screen.getByLabelText("API Key");
        expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
        fireEvent.change(input, { target: { value: apiKey } });
        expect(screen.getByRole("status")).toHaveTextContent(model);
        expect(input).toHaveAttribute("aria-describedby", "ai-key-help ai-detected");
        fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
        expect(input).toHaveAttribute("type", "text");
        expect(screen.getByRole("button", { name: "Hide API key" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", { name: "Hide API key" }));
        fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
        expect(onSave).toHaveBeenCalledWith({ apiKey, provider, model });
        expect(JSON.parse(sessionStorage.getItem("gitvize_ai_settings")!)).toEqual({ apiKey, provider, model });
        expect(localStorage.getItem("gitvize_ai_settings")).toBeNull();
        await waitFor(() => expect(opener).toHaveFocus());
        fireEvent.click(opener);
        expect(await screen.findByText("Saved for this tab")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear saved key" }));
        expect(screen.getByLabelText("API Key")).toHaveValue("");
        expect(sessionStorage.getItem("gitvize_ai_settings")).toBeNull();
        expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        await waitFor(() => expect(opener).toHaveFocus());
    });

    it("associates existing validation with the key and cancels without saving the draft", async () => {
        const onSave = jest.fn();
        render(<AIExample onSave={onSave} />);
        const opener = screen.getByRole("button", { name: "AI settings" });
        opener.focus();
        fireEvent.click(opener);
        const input = await screen.findByLabelText("API Key");
        fireEvent.change(input, { target: { value: "unrecognized-ui-fixture" } });
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Key prefix not recognized");
        fireEvent.change(input, { target: { value: "sk-short" } });
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onSave).not.toHaveBeenCalled();
        expect(sessionStorage.getItem("gitvize_ai_settings")).toBeNull();
        await waitFor(() => expect(opener).toHaveFocus());
    });
});
