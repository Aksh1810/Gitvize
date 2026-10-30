import { analysisResponseSchema, MAX_ANALYZE_REQUEST_BYTES, MAX_ANALYZE_README_CHARS, MAX_ANALYZE_TREE_ITEMS, MAX_MERMAID_OUTPUT_BYTES, utf8ByteLength } from "@/lib/analysis-contract";
import type { AnalysisTreeItem, RepositoryAnalysisResult, TreeItem } from "@/types";

interface AnalysisRequestInput {
    owner: string;
    repo: string;
    mode: "smart" | "premium";
    tree: readonly TreeItem[] | readonly AnalysisTreeItem[];
    readme?: string;
    aiSettings?: { provider: string; apiKey: string; model?: string };
}

/** Keep the prioritized prefix supplied by the caller and report any further sampling. */
export function buildAnalysisRequest(input: AnalysisRequestInput) {
    const tree = input.tree.slice(0, MAX_ANALYZE_TREE_ITEMS).map(({ path, type }) => ({ path, type }));
    const readmeTruncated = input.mode === "premium" && (input.readme?.length ?? 0) > MAX_ANALYZE_README_CHARS;
    const serialize = (count: number) => JSON.stringify({
        owner: input.owner,
        repo: input.repo,
        mode: input.mode,
        tree: tree.slice(0, count),
        ...(input.mode === "premium" ? {
            readme: (input.readme ?? "").slice(0, MAX_ANALYZE_README_CHARS),
            readmeTruncated,
            aiSettings: input.aiSettings,
        } : {}),
    });
    let selectedCount = tree.length;
    let body = serialize(selectedCount);
    if (utf8ByteLength(body) > MAX_ANALYZE_REQUEST_BYTES) {
        if (utf8ByteLength(serialize(0)) > MAX_ANALYZE_REQUEST_BYTES) {
            throw new Error("Analysis settings exceed the request size limit.");
        }
        let low = 0;
        let high = selectedCount;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (utf8ByteLength(serialize(middle)) <= MAX_ANALYZE_REQUEST_BYTES) low = middle;
            else high = middle - 1;
        }
        selectedCount = low;
        body = serialize(selectedCount);
    }
    return { body, selectedCount, sampled: selectedCount < input.tree.length, readmeTruncated };
}

/** Mermaid 11's public parser needs the browser DOM even for ordinary node labels. */
export async function resolveAnalysisResponse(value: unknown): Promise<RepositoryAnalysisResult> {
    const parsed = analysisResponseSchema.safeParse(value);
    if (!parsed.success) throw new Error("Analysis returned an invalid result or missing provenance.");
    const result = parsed.data;
    if (result.source !== "pending") return { ...result, source: result.source };

    const code = result.architecture.mermaidDiagram;
    // Keep the existing renderer's 50,000-character ceiling as well as the byte cap.
    if (code && /^flowchart\b/i.test(code.trim()) && code.length <= 50_000 && utf8ByteLength(code) <= MAX_MERMAID_OUTPUT_BYTES) {
        try {
            const mermaid = (await import("mermaid")).default;
            const syntax = await mermaid.parse(code, { suppressErrors: true });
            if (syntax && (syntax.diagramType === "flowchart-v2" || syntax.diagramType === "flowchart")) {
                return { ...result, source: "ai" };
            }
        } catch {
            // Syntax validation must not turn a candidate into verified output on failure.
        }
    }
    return {
        ...result,
        source: "fallback",
        fallbackReason: "The AI diagram could not be validated; showing a Smart diagram.",
        architecture: { ...result.architecture, mermaidDiagram: undefined },
    };
}
