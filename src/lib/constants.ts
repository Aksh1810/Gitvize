// ============================================================================
// GitViz — Constants
// ============================================================================

import { ExampleRepo } from "@/types";

export const EXAMPLE_REPOS: ExampleRepo[] = [
    { owner: "facebook", repo: "react", description: "A declarative, efficient, and flexible JavaScript library for building user interfaces", stars: "228k", language: "JavaScript" },
    { owner: "vercel", repo: "next.js", description: "The React Framework for the Web", stars: "128k", language: "JavaScript" },
    { owner: "microsoft", repo: "vscode", description: "Visual Studio Code — Code editing, redefined", stars: "165k", language: "TypeScript" },
    { owner: "denoland", repo: "deno", description: "A modern runtime for JavaScript and TypeScript", stars: "97k", language: "Rust" },
    { owner: "tailwindlabs", repo: "tailwindcss", description: "A utility-first CSS framework for rapid UI development", stars: "84k", language: "TypeScript" },
    { owner: "sveltejs", repo: "svelte", description: "Cybernetically enhanced web apps", stars: "80k", language: "JavaScript" },
    { owner: "golang", repo: "go", description: "The Go programming language", stars: "125k", language: "Go" },
    { owner: "rust-lang", repo: "rust", description: "Empowering everyone to build reliable and efficient software", stars: "99k", language: "Rust" },
];

export const FILE_EXTENSION_COLORS: Record<string, string> = {
    ts: "#3178c6",
    tsx: "#3178c6",
    js: "#f7df1e",
    jsx: "#f7df1e",
    py: "#3776ab",
    rb: "#cc342d",
    go: "#00add8",
    rs: "#dea584",
    java: "#b07219",
    kt: "#a97bff",
    swift: "#fa7343",
    c: "#555555",
    cpp: "#f34b7d",
    h: "#555555",
    cs: "#178600",
    php: "#4f5d95",
    html: "#e34c26",
    css: "#563d7c",
    scss: "#c6538c",
    json: "#292929",
    yaml: "#cb171e",
    yml: "#cb171e",
    md: "#083fa1",
    sql: "#e38c00",
    sh: "#89e051",
    bash: "#89e051",
    dockerfile: "#384d54",
    toml: "#9c4221",
    xml: "#0060ac",
    svg: "#ff9900",
    vue: "#41b883",
    svelte: "#ff3e00",
};

export const MODULE_TYPE_COLORS: Record<string, string> = {
    api: "#6366f1",
    ui: "#22d3ee",
    database: "#f59e0b",
    config: "#8b5cf6",
    utility: "#10b981",
    test: "#ef4444",
    build: "#f97316",
    docs: "#64748b",
    core: "#3b82f6",
    middleware: "#a855f7",
    service: "#06b6d4",
    model: "#eab308",
    controller: "#14b8a6",
    view: "#ec4899",
    other: "#6b7280",
};

export const DIAGRAM_TABS = [
    { id: "architecture" as const, label: "Architecture", icon: "Boxes" },
    { id: "files" as const, label: "File Tree", icon: "FolderTree" },
    { id: "contributors" as const, label: "Contributors", icon: "Users" },
    { id: "branches" as const, label: "Branches", icon: "GitBranch" },
    { id: "dependencies" as const, label: "Dependencies", icon: "Package" },
] as const;

export const HOW_IT_WORKS_STEPS = [
    {
        title: "Paste a Repo URL",
        description: "Enter any GitHub repository URL or owner/repo slug. Works with public and private repos.",
        icon: "Link",
    },
    {
        title: "AI Analyzes the Code",
        description: "Our AI pipeline ingests the file tree, reads the README, and builds a deep understanding of the architecture.",
        icon: "Brain",
    },
    {
        title: "Explore Visualizations",
        description: "Navigate interactive diagrams — architecture maps, file trees, contributor networks, and more.",
        icon: "LayoutDashboard",
    },
];
