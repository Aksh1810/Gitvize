import { z } from "zod";
import type { ArchitectureAnalysis, RepositoryAnalysisResponse } from "@/types";

export const MAX_ANALYZE_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_ANALYZE_README_CHARS = 50_000;
export const MAX_ANALYZE_TREE_ITEMS = 5_000;
export const MAX_MERMAID_OUTPUT_BYTES = 64 * 1024;

export const analysisTreeSchema = z.array(z.object({
    path: z.string().min(1).max(4096),
    type: z.enum(["blob", "tree"]),
})).max(MAX_ANALYZE_TREE_ITEMS);

const strings = z.array(z.string());
export const analysisMetadataSchema = z.object({
    techStack: strings,
    architecturePattern: z.string(),
    description: z.string(),
    modules: z.array(z.object({
        name: z.string(),
        type: z.enum(["api", "ui", "database", "config", "utility", "test", "build", "docs", "core", "middleware", "service", "model", "controller", "view", "other"]),
        description: z.string(),
        files: strings,
        dependencies: strings,
        entryPoint: z.string().optional(),
    })),
    entryPoints: strings,
});

export const architectureSchema: z.ZodType<ArchitectureAnalysis> = analysisMetadataSchema.extend({
    dataFlow: z.array(z.object({ from: z.string(), to: z.string(), description: z.string() })),
    fileNodes: z.array(z.object({ path: z.string(), label: z.string(), group: z.string(), role: z.string() })).optional(),
    fileEdges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })).optional(),
    groups: z.array(z.object({ name: z.string(), label: z.string(), color: z.string() })).optional(),
    mermaidDiagram: z.string().optional(),
});

export const analysisResponseSchema: z.ZodType<RepositoryAnalysisResponse> = z.object({
    architecture: architectureSchema,
    annotations: z.array(z.object({ path: z.string(), role: z.string(), description: z.string(), module: z.string() })),
    source: z.enum(["smart", "pending", "fallback"]),
    metadataSource: z.enum(["ai", "deterministic"]),
    fallbackReason: z.string().max(512).optional(),
    readmeTruncated: z.boolean().optional(),
}).refine(value => value.source !== "smart" || value.metadataSource === "deterministic");

export function utf8ByteLength(text: string): number {
    return new TextEncoder().encode(text).byteLength;
}
