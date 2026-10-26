import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import Navbar from "@/components/dashboard/navbar";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

function setClipboard(value: { writeText: jest.Mock } | undefined) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

it("keeps the grouped repository actions named and connected to their callbacks", () => {
  const onGithubToken = jest.fn();
  const onAISettings = jest.fn();
  const onExport = jest.fn();
  render(<Navbar owner="example" repo="repo" onGithubToken={onGithubToken} onAISettings={onAISettings} onExport={onExport} />);
  const actions = within(screen.getByRole("group", { name: "Repository actions" }));
  fireEvent.click(actions.getByRole("button", { name: "GitHub token" }));
  fireEvent.click(actions.getByRole("button", { name: "AI settings" }));
  fireEvent.click(actions.getByRole("button", { name: "Export repository data" }));
  expect(actions.getByRole("button", { name: "Copy share link" })).toBeEnabled();
  expect(onGithubToken).toHaveBeenCalledTimes(1);
  expect(onAISettings).toHaveBeenCalledTimes(1);
  expect(onExport).toHaveBeenCalledTimes(1);
});

it("copies the current repository URL and confirms success", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  setClipboard({ writeText });
  render(<Navbar owner="example" repo="repo" />);

  fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
    "Link copied to clipboard!",
    { description: window.location.href },
  ));
  expect(writeText).toHaveBeenCalledWith(window.location.href);
  expect(toast.error).not.toHaveBeenCalled();
});

it.each(["unavailable", "rejected", "throws"])("offers a manual copy fallback when the clipboard %s", async (failure) => {
  const writeText = jest.fn();
  if (failure === "rejected") writeText.mockRejectedValue(new Error("Permission denied"));
  if (failure === "throws") writeText.mockImplementation(() => { throw new Error("Clipboard unavailable"); });
  setClipboard(failure === "unavailable" ? undefined : { writeText });
  render(<Navbar owner="example" repo="repo" />);

  fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining("Copy it from your address bar"),
    { description: window.location.href },
  ));
  expect(screen.getByRole("button", { name: "Copy share link" })).toBeEnabled();
  expect(toast.success).not.toHaveBeenCalled();
});
