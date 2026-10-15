import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RepoOnboardingGuide from "@/components/dashboard/repo-onboarding-guide";

function HelpExample() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Help</button><RepoOnboardingGuide open={open} activeTab="files" onClose={() => setOpen(false)} /></>;
}

it("restores focus to the opening button after Escape without a Radix trigger", async () => {
    render(<HelpExample />);
    const opener = screen.getByRole("button", { name: "Help" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
});
