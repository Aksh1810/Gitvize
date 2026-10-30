export const MAX_FILE_BATCH_PATHS = 50;

type SourceFile = { path: string; content: string };

/** Keep successful batches so graph analysis can use partially available sources. */
export async function fetchSourceFiles(
    owner: string,
    repo: string,
    paths: string[],
    headers: HeadersInit,
    signal?: AbortSignal,
): Promise<SourceFile[]> {
    signal?.throwIfAborted();
    const uniquePaths = [...new Set(paths)];
    const files: SourceFile[] = [];
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    for (let offset = 0; offset < uniquePaths.length; offset += MAX_FILE_BATCH_PATHS) {
        signal?.throwIfAborted();
        try {
            const response = await fetch("/api/github/repo/files", {
                method: "POST",
                headers: requestHeaders,
                body: JSON.stringify({ owner, repo, paths: uniquePaths.slice(offset, offset + MAX_FILE_BATCH_PATHS) }),
                signal,
            });
            signal?.throwIfAborted();
            if (!response.ok) continue;
            const data: { files: SourceFile[] } = await response.json();
            signal?.throwIfAborted();
            files.push(...data.files);
        } catch (error) {
            signal?.throwIfAborted();
            if (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
            // A failed batch must not discard sources loaded by other batches.
        }
    }
    return files;
}
