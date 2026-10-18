export const MAX_FILE_BATCH_PATHS = 50;

type SourceFile = { path: string; content: string };

/** Keep successful batches so graph analysis can use partially available sources. */
export async function fetchSourceFiles(
    owner: string,
    repo: string,
    paths: string[],
    headers: HeadersInit,
): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    for (let offset = 0; offset < paths.length; offset += MAX_FILE_BATCH_PATHS) {
        try {
            const response = await fetch("/api/github/repo/files", {
                method: "POST",
                headers: requestHeaders,
                body: JSON.stringify({ owner, repo, paths: paths.slice(offset, offset + MAX_FILE_BATCH_PATHS) }),
            });
            if (!response.ok) continue;
            const data: { files: SourceFile[] } = await response.json();
            files.push(...data.files);
        } catch {
            // A failed batch must not discard sources loaded by other batches.
        }
    }
    return files;
}
