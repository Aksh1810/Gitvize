/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://gitvize.com/"}
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TrafficAnalytics from "@/components/traffic-analytics";

let mockPathname = "/";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const KEY = "gitvize.analytics-consent";
let gtag: jest.Mock;
let writes: jest.SpyInstance;
let cookieWrites: jest.SpyInstance;
let reload: jest.SpyInstance;
let scriptRequests: string[];

beforeEach(() => {
    localStorage.clear();
    for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        document.cookie = `${name}=; Max-Age=0; Path=/`;
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.gitvize.com`;
    }
    document.getElementById("gitvize-google-analytics")?.remove();
    delete window.dataLayer;
    gtag = jest.fn();
    window.gtag = gtag;
    mockPathname = "/";
    scriptRequests = [];
    const append = document.head.appendChild.bind(document.head);
    jest.spyOn(document.head, "appendChild").mockImplementation(function<T extends Node>(node: T): T {
        if (node instanceof HTMLScriptElement && node.id === "gitvize-google-analytics") {
            scriptRequests.push(node.src);
            node.removeAttribute("src");
        }
        return append(node);
    });
    // JSDOM's public reload method is non-configurable; stub its implementation.
    const symbol = Object.getOwnPropertySymbols(window.location).find(s => s.description === "impl")!;
    const location = (window.location as unknown as Record<symbol, { reload: () => void }>)[symbol];
    reload = jest.spyOn(location, "reload").mockImplementation(() => {});
    writes = jest.spyOn(Storage.prototype, "setItem");
    cookieWrites = jest.spyOn(document, "cookie", "set");
});

afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    delete window.gtag;
    delete window.dataLayer;
    document.getElementById("gitvize-google-analytics")?.remove();
});

async function dismiss(method: "Close" | "Escape") {
    if (method === "Close") fireEvent.click(screen.getByRole("button", { name: "Close" }));
    else fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Analytics choice" })).toHaveFocus());
}

it.each([
    ["granted", "Close"], ["granted", "Escape"], ["denied", "Close"], ["denied", "Escape"],
] as const)("reopens and dismisses %s consent with %s without consent or analytics side effects", async (saved, method) => {
    localStorage.setItem(KEY, saved);
    writes.mockClear();
    render(<TrafficAnalytics />);
    if (saved === "granted") await waitFor(() => expect(gtag).toHaveBeenCalledTimes(3));
    const calls = gtag.mock.calls.length;
    const scripts = scriptRequests.length;
    const opener = screen.getByRole("button", { name: "Analytics choice" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog", { name: "Analytics preferences" });
    expect(screen.getByRole("status")).toHaveTextContent(saved === "granted" ? "analytics allowed" : "analytics declined");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    expect(gtag).toHaveBeenCalledTimes(calls);
    await dismiss(method);
    expect(localStorage.getItem(KEY)).toBe(saved);
    expect(writes).not.toHaveBeenCalled();
    expect(cookieWrites).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledTimes(calls);
    expect(scriptRequests).toHaveLength(scripts);
});

it.each(["Close", "Escape"] as const)("leaves first-visit consent unset after %s and keeps analytics off", async method => {
    render(<TrafficAnalytics />);
    await screen.findByRole("dialog", { name: "Analytics preferences" });
    expect(screen.getByRole("status")).toHaveTextContent("No choice saved. Analytics is off.");
    expect(screen.getByRole("link", { name: "How Google uses data" })).toHaveAttribute("href", "https://policies.google.com/technologies/partner-sites");
    expect(gtag).not.toHaveBeenCalled();
    await dismiss(method);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(writes).not.toHaveBeenCalled();
    expect(cookieWrites).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
    expect(scriptRequests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Analytics choice" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No choice saved");
});

it.each([null, "denied"] as const)("initializes analytics only after an explicit allowed choice from %s", async saved => {
    if (saved) localStorage.setItem(KEY, saved);
    writes.mockClear();
    render(<TrafficAnalytics />);
    if (saved) fireEvent.click(screen.getByRole("button", { name: "Analytics choice" }));
    await screen.findByRole("dialog");
    expect(gtag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
    await waitFor(() => expect(gtag).toHaveBeenCalledTimes(3));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(writes).toHaveBeenCalledWith(KEY, "granted");
    expect(scriptRequests).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-2ZFGF7B4L6"]);
    expect(gtag).toHaveBeenCalledWith("event", "page_view", { page_location: "https://gitvize.com/", page_title: "Gitvize home" });
    expect(reload).not.toHaveBeenCalled();
});

it("records an explicit first-visit decline without initializing analytics or revoking cookies", async () => {
    render(<TrafficAnalytics />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBe("denied");
    expect(gtag).not.toHaveBeenCalled();
    expect(scriptRequests).toHaveLength(0);
    expect(cookieWrites).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
});

it("preserves explicit revocation, Google cookie cleanup and the reload", async () => {
    localStorage.setItem(KEY, "granted");
    document.cookie = "_ga=fixture; Path=/";
    document.cookie = "_ga_fixture=fixture; Path=/; Domain=.gitvize.com";
    document.cookie = "unrelated=keep; Path=/";
    render(<TrafficAnalytics />);
    await waitFor(() => expect(gtag).toHaveBeenCalledTimes(3));
    writes.mockClear(); cookieWrites.mockClear(); gtag.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Analytics choice" }));
    fireEvent.click(await screen.findByRole("button", { name: "No thanks" }));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBe("denied");
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "denied" });
    expect(cookieWrites).toHaveBeenCalledWith("_ga=; Max-Age=0; Path=/; Domain=.gitvize.com");
    expect(cookieWrites).toHaveBeenCalledWith("_ga_fixture=; Max-Age=0; Path=/; Domain=.gitvize.com");
    expect(document.cookie).toBe("unrelated=keep");
    expect(reload).toHaveBeenCalledTimes(1);
});

it("retains Arguments-based initialization, broad page categories and pathname deduplication", async () => {
    localStorage.setItem(KEY, "granted");
    delete window.gtag;
    mockPathname = "/private-owner/private-repository";
    const { rerender } = render(<TrafficAnalytics />);
    await waitFor(() => expect(window.dataLayer).toHaveLength(3));
    expect(window.dataLayer!.every(entry => !Array.isArray(entry))).toBe(true);
    const calls = () => window.dataLayer!.map(entry => Array.from(entry as IArguments));
    expect(calls()[1]).toEqual(["config", "G-2ZFGF7B4L6", { send_page_view: false, page_location: "https://gitvize.com/repository", page_title: "Gitvize repository" }]);
    rerender(<TrafficAnalytics />);
    expect(window.dataLayer).toHaveLength(3);
    mockPathname = "/another-owner/another-repository";
    rerender(<TrafficAnalytics />);
    await waitFor(() => expect(window.dataLayer).toHaveLength(5));
    expect(calls()[4]).toEqual(["event", "page_view", { page_location: "https://gitvize.com/repository", page_title: "Gitvize repository" }]);
    mockPathname = "/";
    rerender(<TrafficAnalytics />);
    await waitFor(() => expect(window.dataLayer).toHaveLength(7));
    expect(calls()[6]).toEqual(["event", "page_view", { page_location: "https://gitvize.com/", page_title: "Gitvize home" }]);
    expect(JSON.stringify(calls())).not.toContain("private-owner");
    expect(JSON.stringify(calls())).not.toContain("another-owner");
    expect(scriptRequests).toHaveLength(1);
});
