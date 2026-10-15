"use client";

import { ThemeProvider as Provider } from "next-themes";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    return <Provider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</Provider>;
}
