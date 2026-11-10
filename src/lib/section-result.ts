import type { SectionError, SectionResult, TreeCoverage } from "@/types";

export function sectionData<T>(section: SectionResult<T>, fallback: T): T {
    return section.status === "ready" || section.status === "partial" ? section.data : fallback;
}

export function sectionErrors(section: SectionResult<unknown>): SectionError[] {
    return section.status === "partial" ? section.errors : section.status === "error" || section.status === "unsupported" ? section.errors ?? [section.error] : [];
}

/** Fixed messages never expose upstream bodies, private paths or credentials. */
export function sectionError(status: number, subject: string, retryAfter?: number): SectionError {
    const code = status === 413 ? "oversized" : status === 401 || status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : "upstream";
    const detail = code === "oversized" ? "exceeds the file size limit" : code === "forbidden" ? "access was denied" : code === "not_found" ? "was not found at the captured revision" : code === "rate_limited" ? "is rate-limited; try again later" : "could not be loaded; try again";
    return { code, status, message: `${subject} ${detail}.`, ...(retryAfter !== undefined ? { retryAfter } : {}) };
}

export function sectionWithData<T>(data: T, errors: SectionError[], hasData: boolean): SectionResult<T> {
    return !errors.length ? { status: "ready", data } : hasData ? { status: "partial", data, errors } : { status: "error", error: errors[0], ...(errors.length > 1 ? { errors } : {}) };
}

/** Legacy collections are usable evidence, never proof of complete coverage. */
export function legacySection<T>(data: T, message = "Coverage is unavailable for this older response."): SectionResult<T> {
    return { status: "partial", data, errors: [{ code: "coverage_unknown", message }] };
}

export function treeCoverageText(coverage: TreeCoverage | undefined, loadedFiles: number): string {
    if (!coverage) return `${loadedFiles.toLocaleString()} files loaded; repository coverage is unknown.`;
    return `${coverage.retainedFiles.toLocaleString()} files loaded from ${coverage.enumeratedTreeItems.toLocaleString()} enumerated tree items (${coverage.enumeratedFiles.toLocaleString()} files). ` +
        (coverage.upstreamTruncated ? "GitHub truncated enumeration; exact repository totals are unknown. " : `${coverage.totalFiles!.toLocaleString()} files in the captured tree. `) +
        (coverage.applicationCapped ? "The application retained the first 5,000 tree items. " : "");
}
