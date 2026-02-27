// ============================================================================
// GitViz — Search Engine (BM25 keyword + fuzzy matching)
// ============================================================================
// Provides fast search across file paths, names, and module labels.

import type { TreeItem } from "@/types";

export interface SearchResult {
    path: string;
    filename: string;
    score: number;
    matchType: "exact" | "prefix" | "contains" | "fuzzy";
    extension?: string;
    highlights: Array<{ start: number; end: number }>;
}

/**
 * BM25-inspired scoring for file search.
 * Rewards exact matches, prefix matches, and contains matches.
 */
export function searchFiles(
    query: string,
    tree: TreeItem[],
    maxResults: number = 20
): SearchResult[] {
    if (!query || query.length < 1) return [];

    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    tree
        .filter(item => item.type === "blob")
        .forEach(item => {
            const path = item.path.toLowerCase();
            const filename = path.split("/").pop() || path;
            const ext = filename.includes(".") ? filename.split(".").pop() : undefined;

            let score = 0;
            let matchType: SearchResult["matchType"] = "fuzzy";
            const highlights: Array<{ start: number; end: number }> = [];

            // Exact filename match
            if (filename === q) {
                score = 100;
                matchType = "exact";
                highlights.push({ start: 0, end: filename.length });
            }
            // Filename starts with query
            else if (filename.startsWith(q)) {
                score = 80;
                matchType = "prefix";
                highlights.push({ start: 0, end: q.length });
            }
            // Filename contains query
            else if (filename.includes(q)) {
                score = 60;
                matchType = "contains";
                const idx = filename.indexOf(q);
                highlights.push({ start: idx, end: idx + q.length });
            }
            // Full path contains query
            else if (path.includes(q)) {
                score = 40;
                matchType = "contains";
                const idx = path.indexOf(q);
                highlights.push({ start: idx, end: idx + q.length });
            }
            // Fuzzy match (characters in order)
            else {
                let qi = 0;
                for (let i = 0; i < path.length && qi < q.length; i++) {
                    if (path[i] === q[qi]) {
                        highlights.push({ start: i, end: i + 1 });
                        qi++;
                    }
                }
                if (qi === q.length) {
                    // All characters found in order
                    score = 20 - (highlights.length > 0 ? highlights[highlights.length - 1].end - highlights[0].start : 0) * 0.1;
                    matchType = "fuzzy";
                }
            }

            if (score > 0) {
                // Bonus for shorter paths (more relevant)
                score += Math.max(0, 10 - path.split("/").length);

                // Bonus for source code files
                if (ext && ["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "cpp"].includes(ext)) {
                    score += 5;
                }

                results.push({
                    path: item.path,
                    filename: item.path.split("/").pop() || item.path,
                    score,
                    matchType,
                    extension: ext,
                    highlights,
                });
            }
        });

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}
