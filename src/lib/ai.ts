// ============================================================================
// GitViz — AI Service Layer (Configurable Provider)
// ============================================================================

import { ArchitectureAnalysis, FileAnnotation, TreeItem } from "@/types";
import { generateMermaidFromTree } from "@/lib/mermaid-generator";

// --- Provider Configuration ---

export interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

function getGeminiKeyPool(): string[] {
    const keys = new Set<string>();

    const csv = process.env.GEMINI_API_KEYS ?? "";
    csv
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .forEach((k) => keys.add(k));

    const single = process.env.GEMINI_API_KEY?.trim();
    if (single) keys.add(single);

    return Array.from(keys);
}

function shouldTryNextGeminiKey(message: string): boolean {
    const msg = message.toLowerCase();
    return (
        msg.includes("429") ||
        msg.includes("403") ||
        msg.includes("resource_exhausted") ||
        msg.includes("rate") ||
        msg.includes("quota") ||
        msg.includes("api key") ||
        msg.includes("invalid")
    );
}

let geminiRequestCursor = 0;

function getRoundRobinGeminiPool(basePool: string[]): string[] {
    if (basePool.length <= 1) return basePool;
    const start = geminiRequestCursor % basePool.length;
    geminiRequestCursor = (geminiRequestCursor + 1) % basePool.length;
    return [...basePool.slice(start), ...basePool.slice(0, start)];
}

function getDefaultConfig(): AIConfig {
    // Prefer dedicated Gemini key pool, then generic AI key.
    const geminiKey = getGeminiKeyPool()[0];
    const genericKey = process.env.AI_API_KEY;
    const provider = geminiKey ? "gemini" : (process.env.AI_PROVIDER ?? "openai");
    return {
        provider,
        apiKey: geminiKey || genericKey || "",
        model: geminiKey ? "gemini-2.5-flash" : (process.env.AI_MODEL ?? "gpt-4o"),
        baseUrl:
            process.env.AI_BASE_URL ??
            (provider === "anthropic"
                ? "https://api.anthropic.com/v1"
                : provider === "gemini"
                    ? "https://generativelanguage.googleapis.com/v1beta"
                    : "https://api.openai.com/v1"),
    };
}

// --- Internal fetch helper ---

async function aiCompletion(
    systemPrompt: string,
    userPrompt: string,
    jsonMode: boolean = true,
    config?: AIConfig
): Promise<string> {
    const cfg = config ?? getDefaultConfig();

    // Gemini: rotate keys when using server-side env keys.
    if (cfg.provider === "gemini") {
        const basePool = config?.apiKey
            ? [config.apiKey]
            : getGeminiKeyPool().length > 0
                ? getGeminiKeyPool()
                : cfg.apiKey
                    ? [cfg.apiKey]
                    : [];

        const pool = getRoundRobinGeminiPool(basePool);

        if (pool.length === 0) {
            throw new Error("Gemini API key is not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.");
        }

        let lastErr: unknown = null;

        for (let keyIdx = 0; keyIdx < pool.length; keyIdx++) {
            const key = pool[keyIdx];
            const maxRetries = 1;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await aiCompletionInner(systemPrompt, userPrompt, jsonMode, {
                        ...cfg,
                        provider: "gemini",
                        apiKey: key,
                    });
                } catch (err) {
                    lastErr = err;
                    const msg = err instanceof Error ? err.message : String(err);

                    if (msg.includes("429") && attempt < maxRetries) {
                        const delay = 5_000;
                        console.log(`Gemini rate limited (429), retrying same key in ${delay / 1000}s...`);
                        await new Promise((r) => setTimeout(r, delay));
                        continue;
                    }

                    if (shouldTryNextGeminiKey(msg) && keyIdx < pool.length - 1) {
                        console.warn(`Gemini key ${keyIdx + 1}/${pool.length} failed; trying next key.`);
                        break;
                    }

                    throw err;
                }
            }
        }

        throw (lastErr instanceof Error
            ? lastErr
            : new Error("Gemini completion failed across all configured keys"));
    }

    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await aiCompletionInner(systemPrompt, userPrompt, jsonMode, cfg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("429") && attempt < maxRetries) {
                const delay = 5_000; // 5s quick retry
                console.log(`Rate limited (429), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
    throw new Error("AI completion failed after retries");
}

async function aiCompletionInner(
    systemPrompt: string,
    userPrompt: string,
    jsonMode: boolean = true,
    config?: AIConfig
): Promise<string> {
    const cfg = config ?? getDefaultConfig();

    if (!cfg.apiKey) {
        throw new Error(
            "AI API key is not configured. Please set it in Settings or via AI_API_KEY env variable."
        );
    }

    const baseUrl = cfg.baseUrl ?? (
        cfg.provider === "anthropic"
            ? "https://api.anthropic.com/v1"
            : cfg.provider === "gemini"
                ? "https://generativelanguage.googleapis.com/v1beta"
                : "https://api.openai.com/v1"
    );

    // --- Gemini provider ---
    if (cfg.provider === "gemini") {
        const res = await fetch(
            `${baseUrl}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 65536,
                        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
                    },
                }),
            }
        );

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Gemini API error ${res.status}: ${body}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    // --- Anthropic provider ---
    if (cfg.provider === "anthropic") {
        const res = await fetch(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": cfg.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: cfg.model,
                max_tokens: 65536,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
            }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Anthropic API error ${res.status}: ${body}`);
        }

        const data = await res.json();
        return data.content[0].text;
    }

    // --- OpenAI / OpenAI-compatible ---
    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model: cfg.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 65536,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
}

/// ============================================================================
// Simplified 2-Step AI Pipeline
// ============================================================================
//
// Step 1: Generate Mermaid diagram code directly (tree + readme → Mermaid)
//         This is the PRIMARY output — no JSON parsing involved.
// Step 2: Generate lightweight metadata JSON (techStack, description, modules)
//         Small schema that fits easily within token limits.
// ============================================================================

const MERMAID_DIRECT_SYSTEM_PROMPT = `You are a principal software engineer creating a system design / architecture diagram using Mermaid.js for a GitHub repository. You will receive the file tree and README.

You MUST output ONLY valid Mermaid code. No markdown fences, no explanation, no commentary. Just pure Mermaid code starting with "flowchart TB".

Diagram Requirements:
1. Use "flowchart TB" (top-to-bottom) for vertical, readable layout
2. Use subgraph blocks to group related components (e.g. "Frontend", "Backend / API", "Core Logic", "Config / Tooling", "Tests")
3. Create 3-6 subgraphs representing architectural layers
4. Include 15-40 nodes covering ALL important files — entry points, components, hooks, core logic, tests, configs
5. Use appropriate node shapes: rectangles ["..."] for services/components, cylinders [("...")] for databases, rounded ("...") for processes
6. Use SPECIFIC edge labels: "renders", "fetches", "queries", "wraps", "configures", "tests", "imports", "orchestrates", "styles" — NEVER generic "depends on" or "uses"
7. Use solid arrows --> for direct dependencies and dotted -.-> for optional/runtime relationships
8. Attach click events to EVERY node: click nodeId "https://github.com/{owner}/{repo}/blob/main/{filepath}"
9. Node IDs must be safe alphanumeric (use underscores, no dots or special chars)
10. Node labels inside ["..."] should describe WHAT the file does (e.g. "GameBoard - grid rendering" not just "GameBoard")
11. Include a "User" external node showing how user input enters the system
12. Add ALL classDef styles at the end

CRITICAL MERMAID SYNTAX RULES:
- Edge labels MUST use pipe syntax: A -->|"renders"| B
- NEVER use colon syntax: A --> B : renders  (THIS IS INVALID and will break the parser)
- Every edge label MUST be inside |"..."| pipes
- Example correct edges:
  User -->|"navigates"| HomePage
  HomePage -->|"renders"| GameBoard
  GameBoard -.->|"uses"| GameEngine

Required classDef styles (MUST include at end):
classDef external fill:#0b1220,stroke:#94a3b8,color:#e2e8f0,stroke-width:1px
classDef ui fill:#0b3a6a,stroke:#93c5fd,color:#eff6ff,stroke-width:1px
classDef hooks fill:#3b1d5a,stroke:#d8b4fe,color:#f5f3ff,stroke-width:1px
classDef core fill:#14532d,stroke:#86efac,color:#ecfdf5,stroke-width:1px
classDef api fill:#7c2d12,stroke:#fdba74,color:#fff7ed,stroke-width:1px
classDef platform fill:#334155,stroke:#cbd5e1,color:#f1f5f9,stroke-width:1px
classDef test fill:#3f3f46,stroke:#a1a1aa,color:#fafafa,stroke-width:1px
classDef doc fill:#1f2937,stroke:#fbbf24,color:#fffbeb,stroke-width:1px`;

function buildMermaidDirectPrompt(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string
): string {
    const trimmedTree = tree.slice(0, 300).map((t) => t.path);

    return `Generate a detailed Mermaid architecture diagram for the GitHub repository "${owner}/${repo}".

## File Tree
${trimmedTree.join("\n")}

## README (excerpt)
${readme.substring(0, 2500)}

GitHub base URL for click events: https://github.com/${owner}/${repo}/blob/main/

Output ONLY the Mermaid code, starting with "flowchart TB". Include click events for every node pointing to the correct GitHub file URL.`;
}

const METADATA_SYSTEM_PROMPT = `You are analyzing a GitHub repository and producing a BRIEF metadata summary. Respond with ONLY valid JSON matching the exact schema below. Keep it concise — short descriptions, no large arrays.

{
  "techStack": ["max 8 technologies"],
  "architecturePattern": "pattern name",
  "description": "1-2 sentence summary of the project",
  "modules": [
    {
      "name": "module name",
      "type": "one of: api, ui, config, utility, test, build, docs, core, other",
      "description": "one-line description",
      "files": ["top 5 file paths only"],
      "dependencies": ["other module names"]
    }
  ],
  "entryPoints": ["main entry file paths (max 3)"]
}`;

function buildMetadataPrompt(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string
): string {
    const trimmedTree = tree.slice(0, 200).map((t) => t.path);

    return `Analyze "${owner}/${repo}" and return the metadata JSON.

File tree (truncated):
${trimmedTree.join("\n")}

README (excerpt):
${readme.substring(0, 1500)}`;
}

// --- Strip markdown fences and sanitize Mermaid output ---

function stripMermaidFences(raw: string): string {
    return raw
        .replace(/^```mermaid\n?/i, "")
        .replace(/^```\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
}

/**
 * Fix common Mermaid syntax issues from AI output:
 * - Convert "A --> B : label" to 'A -->|"label"| B'
 * - Convert "A -.-> B : label" to 'A -.->|"label"| B'
 */
function sanitizeMermaidCode(code: string): string {
    const lines = code.split("\n");
    const fixed = lines.map(line => {
        // Match: NodeA --> NodeB : some label
        // Match: NodeA -.-> NodeB : some label
        const edgeWithColon = line.match(/^(\s*)(\S+)\s+(--+>|-\.->)\s+(\S+)\s*:\s*(.+)$/);
        if (edgeWithColon) {
            const [, indent, from, arrow, to, label] = edgeWithColon;
            const cleanLabel = label.trim().replace(/"/g, "'");
            return `${indent}${from} ${arrow}|"${cleanLabel}"| ${to}`;
        }
        return line;
    });
    return fixed.join("\n");
}

function cleanJsonString(raw: string): string {
    let clean = raw.replace(/^```(json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    clean = clean.replace(/,\s*([\]}])/g, "$1"); // trailing comma removal
    return clean;
}

// --- Pipeline Steps ---

export async function analyzeRepository(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string,
    onProgress?: (step: string, message: string) => void,
    aiConfig?: AIConfig
): Promise<{ architecture: ArchitectureAnalysis; annotations: FileAnnotation[]; source: "ai" | "fallback"; fallbackReason?: string }> {
    try {
        // ── Step 1: Generate Mermaid diagram directly ──────────────────
        // This is the critical path — outputs raw Mermaid code, not JSON.
        // No JSON parsing === no truncation failures.
        onProgress?.("understand", "Generating AI architecture diagram...");

        let mermaidCode: string;
        try {
            const mermaidRaw = await aiCompletion(
                MERMAID_DIRECT_SYSTEM_PROMPT,
                buildMermaidDirectPrompt(owner, repo, tree, readme),
                false, // NOT json mode — plain text output
                aiConfig
            );
            mermaidCode = stripMermaidFences(mermaidRaw);
            mermaidCode = sanitizeMermaidCode(mermaidCode);

            // Basic validation: must start with "flowchart"
            if (!mermaidCode.toLowerCase().startsWith("flowchart")) {
                console.warn("AI Mermaid output doesn't start with 'flowchart', falling back");
                mermaidCode = generateMermaidFromTree(tree, owner, repo);
            }
        } catch (err) {
            console.error("AI Mermaid generation failed, using fallback:", err);
            mermaidCode = generateMermaidFromTree(tree, owner, repo);
        }

        // ── Step 2: Generate lightweight metadata ─────────────────────
        // Small JSON schema that always fits within token limits.
        onProgress?.("enrich", "Generating project metadata...");

        let architecture: ArchitectureAnalysis;
        try {
            const metadataRaw = await aiCompletion(
                METADATA_SYSTEM_PROMPT,
                buildMetadataPrompt(owner, repo, tree, readme),
                true, // json mode
                aiConfig
            );

            const cleaned = cleanJsonString(metadataRaw);
            const metadata = JSON.parse(cleaned);

            architecture = {
                techStack: metadata.techStack ?? [],
                architecturePattern: metadata.architecturePattern ?? "Unknown",
                description: metadata.description ?? `${owner}/${repo}`,
                modules: (metadata.modules ?? []).map((m: Record<string, unknown>) => ({
                    name: m.name ?? "Unknown",
                    type: m.type ?? "other",
                    description: m.description ?? "",
                    files: (m.files as string[]) ?? [],
                    dependencies: (m.dependencies as string[]) ?? [],
                })),
                entryPoints: metadata.entryPoints ?? [],
                dataFlow: [],
                mermaidDiagram: mermaidCode,
            };
        } catch (err) {
            console.warn("Metadata generation failed, using minimal metadata:", err);
            // Metadata failed but Mermaid succeeded — still a win, use mock metadata
            const mock = getMockAnalysis(owner, repo, tree);
            architecture = {
                ...mock.architecture,
                mermaidDiagram: mermaidCode,
            };
        }

        return { architecture, annotations: [], source: "ai" };
    } catch (err) {
        // ALL AI failed — fall back to mock analysis entirely
        console.error("AI pipeline failed entirely, using mock analysis:", err);
        onProgress?.("enrich", "AI unavailable, generating fallback diagram...");
        return {
            ...getMockAnalysis(owner, repo, tree),
            source: "fallback",
            fallbackReason: err instanceof Error ? err.message : String(err),
        };
    }
}

// --- Mock Analysis (for development without AI key) ---

export function getMockAnalysis(
    owner: string,
    repo: string,
    tree: TreeItem[]
): { architecture: ArchitectureAnalysis; annotations: FileAnnotation[] } {
    const dirs = new Set<string>();
    tree.forEach((t) => {
        const parts = t.path.split("/");
        if (parts.length > 1) dirs.add(parts[0]);
    });

    const moduleTypes: Record<string, "api" | "ui" | "config" | "test" | "utility" | "core" | "docs" | "build"> = {
        src: "core", lib: "utility", app: "ui", api: "api", pages: "ui",
        components: "ui", test: "test", tests: "test", __tests__: "test",
        config: "config", docs: "docs", scripts: "build", public: "ui",
        styles: "ui", utils: "utility", helpers: "utility", models: "core",
        services: "api", middleware: "api", database: "core", db: "core",
    };

    const groupColors: Record<string, { label: string; color: string }> = {
        ui: { label: "UI / View Components", color: "#3b82f6" },
        core: { label: "Core Logic", color: "#22c55e" },
        api: { label: "API / Services", color: "#6366f1" },
        test: { label: "Tests", color: "#ef4444" },
        config: { label: "Dev / Tooling / Deploy", color: "#64748b" },
        utility: { label: "Utilities", color: "#10b981" },
        docs: { label: "Documentation", color: "#64748b" },
        build: { label: "Build / Scripts", color: "#f97316" },
        other: { label: "Other", color: "#6b7280" },
    };

    const modules = Array.from(dirs).slice(0, 12).map((dir) => ({
        name: dir.charAt(0).toUpperCase() + dir.slice(1),
        type: moduleTypes[dir.toLowerCase()] ?? ("other" as const),
        description: `Contains ${tree.filter((t) => t.path.startsWith(dir + "/")).length} files`,
        files: tree.filter((t) => t.path.startsWith(dir + "/") && t.type === "blob").map((t) => t.path).slice(0, 30),
        dependencies: [] as string[],
    }));

    if (modules.length > 1) {
        for (let i = 1; i < modules.length; i++) {
            modules[i].dependencies = [modules[0].name];
        }
    }

    // Build file-level nodes from ALL files
    const allFiles = tree.filter((t) => t.type === "blob").slice(0, 100);
    const usedGroups = new Set<string>();

    const fileNodes = allFiles.map((f) => {
        const parts = f.path.split("/");
        const fileName = parts[parts.length - 1];
        const baseName = fileName.replace(/\.[^/.]+$/, "");

        let groupType = "other";
        const lower = f.path.toLowerCase();
        if (lower.includes("test") || lower.includes("spec") || lower.includes("__tests__")) groupType = "test";
        else if (lower.includes("component") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) groupType = "ui";
        else if (lower.includes("hook")) groupType = "core";
        else if (lower.includes("api") || lower.includes("route")) groupType = "api";
        else if (lower.includes("lib") || lower.includes("util") || lower.includes("helper")) groupType = "utility";
        else if (lower.includes("core") || lower.includes("engine")) groupType = "core";
        else if (lower.endsWith(".css") || lower.endsWith(".scss")) groupType = "ui";
        else if (lower.endsWith(".md") || lower.includes("doc")) groupType = "docs";
        else if (lower.includes("config") || lower.includes(".json") || parts.length === 1) groupType = "config";

        usedGroups.add(groupType);

        // Create descriptive label
        let label = baseName;
        const role = getFileRole(f.path);
        if (role !== "Source") {
            label = `${baseName} (${role.toLowerCase()})`;
        }

        return {
            path: f.path,
            label: label.length > 30 ? label.substring(0, 28) + "…" : label,
            group: groupType,
            role,
        };
    });

    // Build edges from file relationships
    const fileEdges: Array<{ from: string; to: string; label: string }> = [];

    // Index files → siblings
    const byDir = new Map<string, typeof allFiles>();
    allFiles.forEach((f) => {
        const dir = f.path.split("/").slice(0, -1).join("/") || "root";
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir)!.push(f);
    });

    byDir.forEach((files) => {
        const barrel = files.find((f) => {
            const name = f.path.split("/").pop() || "";
            return name.startsWith("index.") || name.startsWith("page.") || name.startsWith("layout.");
        });
        if (barrel && files.length > 1) {
            files.filter((f) => f !== barrel).forEach((f) => {
                const ext = f.path.split(".").pop() || "";
                let rel = "imports";
                if (ext === "tsx" || ext === "jsx") rel = "renders";
                else if (ext === "css" || ext === "scss") rel = "styles";
                else if (f.path.includes("test")) rel = "tests";
                fileEdges.push({ from: barrel.path, to: f.path, label: rel });
            });
        }
    });

    // Test → tested file
    allFiles.forEach((f) => {
        const name = f.path.split("/").pop() || "";
        const testMatch = name.match(/^(.+?)\.(test|spec)\.(\w+)$/);
        if (testMatch) {
            const targetName = testMatch[1];
            const target = allFiles.find((t) => {
                const tName = (t.path.split("/").pop() || "").replace(/\.[^/.]+$/, "");
                return tName === targetName && t !== f;
            });
            if (target) {
                fileEdges.push({ from: f.path, to: target.path, label: "tests" });
            }
        }
    });

    // Pages → components
    const pages = allFiles.filter((f) => f.path.includes("/app/") || f.path.includes("/pages/"));
    const comps = allFiles.filter((f) => f.path.includes("component") && !f.path.includes("test"));
    pages.forEach((p) => {
        comps.slice(0, 4).forEach((c) => {
            fileEdges.push({ from: p.path, to: c.path, label: "renders" });
        });
    });

    // Hooks → core
    const hooks = allFiles.filter((f) => f.path.includes("hook"));
    const coreFiles = allFiles.filter((f) => f.path.includes("core/") || f.path.includes("lib/"));
    hooks.forEach((h) => {
        coreFiles.slice(0, 3).forEach((c) => {
            fileEdges.push({ from: h.path, to: c.path, label: "orchestrates" });
        });
    });

    // Config chains
    const configs = allFiles.filter((f) => !f.path.includes("/"));
    const pkg = configs.find((f) => f.path.includes("package.json"));
    if (pkg) {
        configs.filter((f) => f !== pkg).forEach((f) => {
            fileEdges.push({ from: pkg.path, to: f.path, label: "configures" });
        });
    }

    // Build groups
    const groups = Array.from(usedGroups).map((g) => ({
        name: g,
        label: groupColors[g]?.label || g,
        color: groupColors[g]?.color || "#6b7280",
    }));

    const architecture: ArchitectureAnalysis = {
        techStack: inferTechStack(tree),
        architecturePattern: "Modular",
        description: `${owner}/${repo} — Analyzed ${tree.length} files across ${modules.length} modules.`,
        modules,
        entryPoints: tree.filter((t) => t.type === "blob").filter((t) => t.path.match(/^(index|main|app|server)\.(ts|js|tsx|jsx|py|go|rs)$/) !== null).map((t) => t.path).slice(0, 5),
        dataFlow: modules.length > 1 ? [{ from: modules[0].name, to: modules[1].name, description: "Primary data flow" }] : [],
        fileNodes,
        fileEdges,
        groups,
        mermaidDiagram: generateMermaidFromTree(tree, owner, repo),
    };

    const annotations: FileAnnotation[] = tree.filter((t) => t.type === "blob").slice(0, 100).map((t) => {
        const dir = t.path.split("/")[0];
        const mod = modules.find((m) => m.name.toLowerCase() === dir.toLowerCase());
        return { path: t.path, role: getFileRole(t.path), description: `File in ${dir}`, module: mod?.name ?? "Other" };
    });

    return { architecture, annotations };
}

function inferTechStack(tree: TreeItem[]): string[] {
    const stack: string[] = [];
    const paths = tree.map((t) => t.path.toLowerCase());

    if (paths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx"))) stack.push("TypeScript");
    if (paths.some((p) => p.endsWith(".js") || p.endsWith(".jsx"))) stack.push("JavaScript");
    if (paths.some((p) => p.endsWith(".py"))) stack.push("Python");
    if (paths.some((p) => p.endsWith(".go"))) stack.push("Go");
    if (paths.some((p) => p.endsWith(".rs"))) stack.push("Rust");
    if (paths.some((p) => p.endsWith(".java"))) stack.push("Java");
    if (paths.some((p) => p.includes("next.config"))) stack.push("Next.js");
    if (paths.some((p) => p.includes("vite.config"))) stack.push("Vite");
    if (paths.some((p) => p === "package.json")) stack.push("Node.js");
    if (paths.some((p) => p.includes("docker"))) stack.push("Docker");
    if (paths.some((p) => p.includes("tailwind"))) stack.push("Tailwind CSS");
    if (paths.some((p) => p.endsWith(".vue"))) stack.push("Vue");
    if (paths.some((p) => p.endsWith(".svelte"))) stack.push("Svelte");

    return stack.length > 0 ? stack : ["Unknown"];
}

function getFileRole(path: string): string {
    const lower = path.toLowerCase();
    if (lower.includes("test") || lower.includes("spec")) return "Test";
    if (lower.includes("config") || lower.includes("rc")) return "Config";
    if (lower.includes("component")) return "Component";
    if (lower.includes("api") || lower.includes("route")) return "API";
    if (lower.includes("model") || lower.includes("schema")) return "Model";
    if (lower.includes("util") || lower.includes("helper")) return "Utility";
    if (lower.includes("style") || lower.includes("css")) return "Style";
    if (lower.includes("doc") || lower.endsWith(".md")) return "Documentation";
    return "Source";
}
