import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GitViz — Visualize Any GitHub Repository",
  description:
    "Turn any GitHub repository into stunning, interactive visualizations. Architecture diagrams, file trees, contributor networks, and more — all AI-powered.",
  openGraph: {
    title: "GitViz — Visualize Any GitHub Repository",
    description:
      "Turn any GitHub repository into stunning, interactive visualizations.",
    siteName: "GitViz",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GitViz — Visualize Any GitHub Repository",
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
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <TooltipProvider delayDuration={300}>
          <div className="stars-bg" />
          {children}
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(15, 23, 42, 0.9)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "#f1f5f9",
            },
          }}
        />
      </body>
    </html>
  );
}
