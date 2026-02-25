// ============================================================================
// GitViz — File Icons & Extension Mapping
// ============================================================================

import { FILE_EXTENSION_COLORS } from "./constants";

export function getFileColor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return FILE_EXTENSION_COLORS[ext] ?? "#6b7280";
}

export function getFileIconName(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const name = filename.toLowerCase();

    // Special files
    if (name === "dockerfile" || name.startsWith("dockerfile.")) return "Container";
    if (name === ".gitignore" || name === ".gitattributes") return "GitBranch";
    if (name === "license" || name === "license.md") return "Scale";
    if (name === "readme.md" || name === "readme") return "BookOpen";
    if (name === "package.json") return "Package";
    if (name === "tsconfig.json") return "Settings";
    if (name.includes("test") || name.includes("spec")) return "TestTube";
    if (name.includes("config") || name.includes("rc")) return "Settings";

    // By extension
    const iconMap: Record<string, string> = {
        ts: "FileCode",
        tsx: "FileCode",
        js: "FileCode",
        jsx: "FileCode",
        py: "FileCode",
        rb: "FileCode",
        go: "FileCode",
        rs: "FileCode",
        java: "FileCode",
        html: "Globe",
        css: "Palette",
        scss: "Palette",
        json: "Braces",
        yaml: "FileText",
        yml: "FileText",
        md: "FileText",
        sql: "Database",
        sh: "Terminal",
        bash: "Terminal",
        svg: "Image",
        png: "Image",
        jpg: "Image",
        gif: "Image",
        ico: "Image",
        env: "Lock",
    };

    return iconMap[ext] ?? "File";
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
