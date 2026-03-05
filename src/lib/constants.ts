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
    ts: "#2196F3",       // dodger blue
    tsx: "#AB47BC",      // medium purple
    js: "#FFEB3B",       // bright yellow
    jsx: "#FF9800",      // vivid orange
    py: "#26C6DA",       // turquoise
    rb: "#F44336",       // pure red
    go: "#00BFA5",       // mint
    rs: "#FF7043",       // coral
    java: "#7E57C2",     // deep lavender
    kt: "#EC407A",       // hot pink
    swift: "#FFA726",    // tangerine
    c: "#66BB6A",        // grass green
    cpp: "#EF5350",      // vermillion
    h: "#29B6F6",        // light sky
    cs: "#8BC34A",       // lime green
    php: "#5C6BC0",      // slate blue
    html: "#E91E63",     // magenta
    css: "#CE93D8",      // orchid
    scss: "#F06292",     // flamingo
    json: "#FDD835",     // sunflower
    yaml: "#FF5252",     // strawberry
    yml: "#FF5252",      // strawberry
    md: "#4FC3F7",       // baby blue
    sql: "#FFCA28",      // gold
    sh: "#69F0AE",       // neon green
    bash: "#69F0AE",     // neon green
    dockerfile: "#00ACC1", // dark teal
    toml: "#D84315",     // rust
    xml: "#42A5F5",      // cornflower
    svg: "#FFD54F",      // butter
    vue: "#00E676",      // emerald
    svelte: "#FF1744",   // scarlet
    graphql: "#D500F9",  // electric purple
    proto: "#00B8D4",    // pacific blue
    tf: "#651FFF",       // royal violet
    zig: "#F9A825",      // marigold 
    lock: "#90A4AE",     // steel
    env: "#AA00FF",      // neon purple
    txt: "#BDBDBD",      // silver
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
    { id: "files" as const, label: "File Tree", icon: "FolderTree" },
    { id: "architecture" as const, label: "Architecture", icon: "Boxes" },
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
