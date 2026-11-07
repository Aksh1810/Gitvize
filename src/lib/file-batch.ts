import type { RepositorySnapshot } from "@/types";

export const MAX_FILE_BATCH_PATHS = 50;

type SourceFile = { path: string; content: string };

/** Keep successful batches so graph analysis can use partially available sources. */
export async function fetchSourceFiles(
    owner: string,
    repo: string,
    paths: string[],
    headers: HeadersInit,
    signal?: AbortSignal,
    snapshot?: RepositorySnapshot,
): Promise<SourceFile[]> {
    signal?.throwIfAborted();
    const uniquePaths = [...new Set(paths)];
    const files: SourceFile[] = [];
    let failure: Error | undefined;
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    for (let offset = 0; offset < uniquePaths.length; offset += MAX_FILE_BATCH_PATHS) {
        signal?.throwIfAborted();
        try {
            const response = await fetch("/api/github/repo/files", {
                method: "POST",
                headers: requestHeaders,
                body: JSON.stringify({ owner, repo, snapshot, paths: uniquePaths.slice(offset, offset + MAX_FILE_BATCH_PATHS) }),
                signal,
            });
            signal?.throwIfAborted();
            const data: { files?: SourceFile[]; error?: string } = await response.json().catch(() => ({}));
            signal?.throwIfAborted();
            if (response.status === 499) throw new DOMException("Source loading cancelled", "AbortError");
            if (!response.ok) { failure ??= new Error(data.error ?? `Source files unavailable (HTTP ${response.status})`); continue; }
            if (!Array.isArray(data.files)) throw new Error("Invalid source batch response");
            if (!data.files.length) throw new Error("None of the requested source files could be loaded");
            files.push(...data.files);
        } catch (error) {
            signal?.throwIfAborted();
            if (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
            failure ??= error instanceof Error ? error : new Error("Source files unavailable");
            // A failed batch must not discard sources loaded by other batches.
        }
    }
    if (!files.length && failure) throw failure;
    return files;
}
