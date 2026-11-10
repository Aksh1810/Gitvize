import type { FilePathOutcome, RepositorySnapshot, SectionError } from "@/types";
import { sectionError } from "@/lib/section-result";

export const MAX_FILE_BATCH_PATHS = 50;
type SourceFile = { path: string; content: string };
export interface SourceFilesResult { files: SourceFile[]; outcomes: FilePathOutcome[] }
export class SourceFilesError extends Error {
    constructor(public readonly outcomes: FilePathOutcome[]) {
        super(outcomes.find(outcome => outcome.status === "error")?.error.message ?? "Source files unavailable");
    }
}

/** Retain successes and typed failures; cancellation is never a successful partial read. */
export async function fetchSourceFiles(
    owner: string, repo: string, paths: string[], headers: HeadersInit,
    signal?: AbortSignal, snapshot?: RepositorySnapshot,
): Promise<SourceFilesResult> {
    signal?.throwIfAborted();
    const uniquePaths = [...new Set(paths)];
    const files = new Map<string, SourceFile>();
    const outcomes = new Map<string, FilePathOutcome>();
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    for (let offset = 0; offset < uniquePaths.length; offset += MAX_FILE_BATCH_PATHS) {
        signal?.throwIfAborted();
        const batch = uniquePaths.slice(offset, offset + MAX_FILE_BATCH_PATHS);
        let batchError: SectionError | undefined;
        try {
            const response = await fetch("/api/github/repo/files", {
                method: "POST", headers: requestHeaders,
                body: JSON.stringify({ owner, repo, snapshot, paths: batch }), signal,
            });
            signal?.throwIfAborted();
            const data = await response.json().catch(() => ({}));
            signal?.throwIfAborted();
            if (response.status === 499) throw new DOMException("Source loading cancelled", "AbortError");
            const retry = Number(response.headers?.get("Retry-After") ?? NaN);
            batchError = sectionError(response.status || 502, "Source batch", Number.isFinite(retry) && retry >= 0 ? retry : undefined);
            if (response.status === 413) batchError = { ...batchError, code: "batch_too_large", message: "Source batch exceeds the 2 MiB response limit. Retry fewer files." };
            // Legacy successes are usable; only submitted, unique paths can enter the source cache.
            if (response.ok && Array.isArray(data.files)) for (const file of data.files) {
                if (batch.includes(file?.path) && typeof file.content === "string") {
                    files.set(file.path, { path: file.path, content: file.content });
                    outcomes.set(file.path, { path: file.path, status: "ready" });
                }
            }
            for (const path of batch) {
                if (files.has(path)) continue;
                const failure = Array.isArray(data.outcomes) ? data.outcomes.find((o: FilePathOutcome) => o?.path === path && o.status === "error") : undefined;
                const legacy = Array.isArray(data.errors) ? data.errors.find((o: { path: string; status: number }) => o?.path === path) : undefined;
                // Recreate fixed safe messages; don't trust upstream error text.
                const status = failure?.error?.status ?? legacy?.status;
                const error = Number.isInteger(status) && status >= 400 && status <= 599 ? sectionError(status, "Pinned file", Number.isFinite(failure?.error?.retryAfter) && failure.error.retryAfter >= 0 ? failure.error.retryAfter : undefined) : response.ok ? sectionError(502, "Requested source") : batchError;
                outcomes.set(path, { path, status: "error", error });
            }
        } catch (error) {
            signal?.throwIfAborted();
            if (error !== null && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
            batchError = sectionError(502, "Source batch");
            for (const path of batch) if (!files.has(path)) outcomes.set(path, { path, status: "error", error: batchError });
        }
    }
    const result = { files: [...files.values()], outcomes: uniquePaths.map(path => outcomes.get(path)!) };
    if (uniquePaths.length && !result.files.length) throw new SourceFilesError(result.outcomes);
    return result;
}
