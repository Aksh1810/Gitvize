import { Metadata } from "next";
import { Suspense } from "react";
import RepoPageClient from "./repo-page-client";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
    params: Promise<{ owner: string; repo: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { owner, repo } = await params;

    return {
        title: `${repo}`,
        description: `Interactive visualization of ${owner}/${repo} — architecture diagrams, file tree, contributors, and more.`,
        openGraph: {
            title: `Gitvize · ${repo}`,
            description: `Interactive visualization of ${owner}/${repo}`,
            siteName: "Gitvize",
        },
        twitter: {
            card: "summary_large_image",
            title: `Gitvize · ${repo}`,
            description: `Interactive visualization of ${owner}/${repo}`,
        },
    };
}

export default async function RepoPage({ params }: PageProps) {
    const { owner, repo } = await params;

    return (
        <Suspense
            fallback={
                <div className="min-h-screen pt-14 p-6 space-y-6 max-w-7xl mx-auto">
                    <div className="glass-card-strong glow-border p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading</p>
                            <h2 className="text-lg font-semibold">Warming up visual layers</h2>
                        </div>
                        <div className="loading-orbit" />
                    </div>
                    <Skeleton className="h-10 w-48" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-20" />
                        ))}
                    </div>
                    <Skeleton className="h-[500px]" />
                </div>
            }
        >
            <RepoPageClient owner={owner} repo={repo} />
        </Suspense>
    );
}
