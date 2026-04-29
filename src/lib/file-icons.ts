// ============================================================================
// GitViz — File Icons & Extension Mapping
// ============================================================================

import { FILE_EXTENSION_COLORS } from "./constants";

export function getFileColor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return FILE_EXTENSION_COLORS[ext] ?? "#6b7280";
}

export function getLanguageColor(language: string): string {
    const colors: Record<string, string> = {
        JavaScript: "#f7df1e",
        TypeScript: "#3178c6",
        Python: "#3776ab",
        Java: "#b07219",
        Go: "#00add8",
        Rust: "#dea584",
        Ruby: "#cc342d",
        PHP: "#4f5d95",
        "C++": "#f34b7d",
        C: "#555555",
        "C#": "#178600",
        Swift: "#fa7343",
        Kotlin: "#a97bff",
        HTML: "#e34c26",
        CSS: "#563d7c",
        Shell: "#89e051",
        Vue: "#41b883",
        Svelte: "#ff3e00",
        Dart: "#00b4ab",
        Scala: "#c22d40",
    };
    return colors[language] ?? "#6b7280";
}
