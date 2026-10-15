"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <button type="button" className="theme-toggle" aria-label="Toggle light or dark theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="theme-sun" size={17} aria-hidden="true" />
            <Moon className="theme-moon" size={17} aria-hidden="true" />
        </button>
    );
}
