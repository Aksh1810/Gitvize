import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import TrafficAnalytics from "@/components/traffic-analytics";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import AppMotionProvider from "@/components/motion/app-motion-provider";
import ThemeProvider from "@/components/ui/theme-provider";
import "./globals.css";
import "./atlas.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Gitvize — Visualize Any GitHub Repository",
    template: "Gitvize — %s",
  },
  description:
    "Turn any GitHub repository into stunning, interactive visualizations. Architecture diagrams, file trees, contributor networks, and more — all AI-powered.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Gitvize — Visualize Any GitHub Repository",
    description:
      "Turn any GitHub repository into stunning, interactive visualizations.",
    siteName: "Gitvize",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gitvize — Visualize Any GitHub Repository",
    description:
      "Turn any GitHub repository into stunning, interactive visualizations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${jetBrainsMono.variable} antialiased h-screen bg-background relative overflow-hidden`}
      >
        <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <AppMotionProvider>
            <div className="app-background" />
            {children}
          </AppMotionProvider>
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--atlas-surface)",
              border: "1px solid var(--atlas-line)",
              color: "var(--atlas-ink)",
            },
          }}
        />
        </ThemeProvider>
        <Analytics />
        <TrafficAnalytics />
      </body>
    </html>
  );
}
