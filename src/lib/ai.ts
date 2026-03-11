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
        model: geminiKey ? "gemini-2.0-flash" : (process.env.AI_MODEL ?? "gpt-4o"),
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
                        maxOutputTokens: 8192,
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
                max_tokens: 8192,
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
            max_tokens: 8192,
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

// --- Prompts ---

const ANALYSIS_SYSTEM_PROMPT = `You are a senior software architect who creates detailed architecture diagrams like GitDiagram. Your job is to analyze a repository and produce a DETAILED, FILE-LEVEL architecture graph that shows:
- Every important file as a named node with a specific role label
- Precise relationships between files (renders, composes, imports, orchestrates, tests, styles, configures, etc.)
- Logical groupings (UI/View Components, Controller/Orchestration, Core Engine, Tests, Config/Tooling, etc.)

You MUST respond with valid JSON matching the exact schema. Be extremely thorough — include ALL important files, not just a handful. The diagram should have 20-60 file nodes for a typical project.

IMPORTANT: Use SPECIFIC, DESCRIPTIVE edge labels like GitDiagram does:
- "renders" "composes" "wraps" for UI relationships
- "click/tap" "onMove" for user interactions 
- "prop_drill(GameState)" "setState" for data flow
- "orchestrates" "dispatches" for control flow
- "styles" "animate" for visual relationships  
- "tests" "validates" for test relationships
- "configures" "builds" "lint" for tooling
- "reads/writes" "queries" for data access
Never use generic labels like "depends on" — always be specific about HOW they relate.`;

function buildAnalysisUserPrompt(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string
): string {
    const trimmedTree = tree.slice(0, 500).map((t) => t.path);

    return `Analyze the GitHub repository "${owner}/${repo}" and create a GitDiagram-style architecture diagram.

## File Tree
\`\`\`
${trimmedTree.join("\n")}
\`\`\`

## README
\`\`\`
${readme.substring(0, 3000)}
\`\`\`

Produce a JSON object with this exact schema:
{
  "techStack": ["technologies used"],
  "architecturePattern": "pattern name",
  "description": "2-3 sentence summary",
  "modules": [
    {
      "name": "module name",
      "type": "one of: api, ui, database, config, utility, test, build, docs, core, middleware, service, model, controller, view, other",
      "description": "what this module does",
      "files": ["file paths"],
      "dependencies": ["other module names"],
      "entryPoint": "optional main file"
    }
  ],
  "entryPoints": ["main entry file paths"],
  "dataFlow": [
    { "from": "module name", "to": "module name", "description": "flow description" }
  ],
  "groups": [
    {
      "name": "group_id",
      "label": "Human Readable Group Label (e.g. 'UI / View Components', 'Controller / Orchestration', 'Core Game Engine', 'Dev / Tooling / Deploy', 'Tests')",
      "color": "hex color (blue=#3b82f6 for UI, purple=#8b5cf6 for controllers/hooks, green=#22c55e for core logic, red=#ef4444 for tests, orange=#f97316 for external/platform, gray=#64748b for config/tooling, cyan=#06b6d4 for types/models, pink=#ec4899 for styles)"
    }
  ],
  "fileNodes": [
    {
      "path": "exact file path from tree",
      "label": "Short descriptive label like 'GameCell (cell interactions)' or 'useGame (state machine + AI)' or 'layout.tsx + globals.css'",
      "group": "group_id from groups array",
      "role": "specific role like 'React component', 'Custom hook', 'Game engine', 'Test suite', 'Config file', 'Type definitions'"
    }
  ],
  "fileEdges": [
    {
      "from": "source file path",
      "to": "target file path",
      "label": "specific relationship like 'renders', 'composes', 'click/tap', 'orchestrates', 'prop_drill(State)', 'styles', 'tests', 'configures', 'lint', 'builds'"
    }
  ]
}

IMPORTANT RULES:
1. Include 20-60 fileNodes — cover ALL important files, not just a few
2. Include 30-80 fileEdges — show ALL meaningful relationships between files
3. Create 4-8 groups that represent architectural layers (like "UI / View Components", "Controller / Orchestration", "Core Engine", "Tests", "Config / Tooling")
4. Each fileNode label should describe WHAT the file does, not just its name (e.g. "useGame (state machine + AI integration)" not just "useGame")
5. Each fileEdge label should be SPECIFIC about the relationship type (e.g. "renders_atoms" not just "uses")
6. Include config/root files too (package.json, next.config, eslint, etc.) in a "Dev / Tooling" group
7. Include a "Player" or "User" node if applicable to show user interactions entering the system
8. Group files logically by architectural role, NOT by directory structure`;
}

const ANNOTATION_SYSTEM_PROMPT = `You are annotating repository files with their architectural roles. For each file, provide a one-line description and identify which architectural module it belongs to.

Respond with valid JSON only.`;

function buildAnnotationUserPrompt(
    files: string[],
    modules: string[]
): string {
    const trimmedFiles = files.slice(0, 200);

    return `Given these modules: ${JSON.stringify(modules)}

Annotate these files:
${trimmedFiles.map((f) => `- ${f}`).join("\n")}

Respond with JSON:
{
  "annotations": [
    {
      "path": "file path",
      "role": "short role label (e.g. API endpoint, React component, DB model, config, test, utility)",
      "description": "one-line description of what this file does",
      "module": "which module this belongs to"
    }
  ]
}`;
}

// ============================================================================
// GitDiagram-style 3-Prompt Chain
// ============================================================================
//
// Prompt 1: Architecture Explanation  (tree + readme → natural-language analysis)
// Prompt 2: Component → File Mapping  (explanation + tree → JSON mapping)
// Prompt 3: Mermaid Code Generation   (explanation + mapping → raw Mermaid code)
// ============================================================================

const EXPLAIN_SYSTEM_PROMPT = `You are tasked with explaining to a principal software engineer how to draw the best and most accurate system design diagram / architecture of a given project.

Based on the file tree and README provided:
1. Determine the project type (full-stack app, CLI tool, library, compiler, game, etc.)
2. Identify the key architectural patterns (MVC, microservices, monorepo, component-based, etc.)
3. List the main architectural layers and components (frontend, backend, database, services, etc.)
4. Note configuration files, build scripts, deployment-related files
5. Describe the data flow and how components interact
6. Identify entry points and the user-facing surface

Produce a detailed natural-language explanation of how to represent this project's architecture as a diagram. Describe WHAT to draw and WHY — the components, their relationships, the groupings, and how data flows through the system. Do NOT produce any diagram code, just the explanation.`;

function buildExplainPrompt(tree: TreeItem[], readme: string): string {
    const trimmedTree = tree.slice(0, 500).map((t) => t.path);
    return `<file_tree>\n${trimmedTree.join("\n")}\n</file_tree>\n\n<readme>\n${readme.substring(0, 4000)}\n</readme>\n\nExplain how to draw the architecture diagram for this project.`;
}

const MAPPING_SYSTEM_PROMPT = `You are mapping architectural components to their actual file paths in a repository. Given an architecture explanation and a file tree, produce a JSON mapping of component names to their file paths.

For each identified component or module in the explanation, find the matching file(s) in the file tree.

Respond with ONLY valid JSON in this format:
{
  "components": [
    {
      "name": "Component Name (e.g. Auth Service, GameBoard, useGame hook)",
      "description": "One-line description of what this component does",
      "paths": ["src/components/GameBoard.tsx"],
      "type": "one of: ui, hook, core, api, service, config, test, doc, style, other"
    }
  ]
}`;

function buildMappingPrompt(
    explanation: string,
    tree: TreeItem[],
    owner: string,
    repo: string
): string {
    const trimmedTree = tree.slice(0, 500).map((t) => t.path);
    return `<explanation>\n${explanation}\n</explanation>\n\n<file_tree>\n${trimmedTree.join("\n")}\n</file_tree>\n\nRepository: ${owner}/${repo}\n\nMap each architectural component from the explanation to its actual file path(s) in the file tree. Include ALL important files. Respond with JSON only.`;
}

const MERMAID_GEN_SYSTEM_PROMPT = `You are a principal software engineer creating a system design diagram using Mermaid.js.

You will receive:
1. A detailed architecture explanation
2. A component-to-file-path mapping with click URLs

You MUST output ONLY valid Mermaid code. No markdown fences, no explanation, no commentary. Just pure Mermaid code.

Rules:
- Use "flowchart TB" (top-to-bottom) for vertical, readable layout
- Use subgraph blocks to group related components (e.g. "Frontend", "Backend", "Database", "Config")
- Use appropriate node shapes: rectangles ["..."] for services, cylinders [("...")] for databases, rounded ("...") for processes
- Use SPECIFIC edge labels: "renders", "fetches", "queries", "wraps", "configures", "tests", "imports" — NEVER generic "depends on"
- Use solid arrows --> for direct dependencies and dotted -.-> for optional/runtime relationships
- Attach click events to EVERY node: click nodeId "https://github.com/..."
- Node IDs must be safe alphanumeric (use underscores, no dots or special chars)
- Node labels inside ["..."] must escape any special characters
- Include a "User" external node showing how user input enters the system
- Add classDef styles at the end for color-coding

Required classDef styles (MUST include at end of diagram):
classDef external fill:#0b1220,stroke:#94a3b8,color:#e2e8f0,stroke-width:1px
classDef ui fill:#0b3a6a,stroke:#93c5fd,color:#eff6ff,stroke-width:1px
classDef hooks fill:#3b1d5a,stroke:#d8b4fe,color:#f5f3ff,stroke-width:1px
classDef core fill:#14532d,stroke:#86efac,color:#ecfdf5,stroke-width:1px
classDef api fill:#7c2d12,stroke:#fdba74,color:#fff7ed,stroke-width:1px
classDef platform fill:#334155,stroke:#cbd5e1,color:#f1f5f9,stroke-width:1px
classDef test fill:#3f3f46,stroke:#a1a1aa,color:#fafafa,stroke-width:1px
classDef doc fill:#1f2937,stroke:#fbbf24,color:#fffbeb,stroke-width:1px`;

function buildMermaidGenPrompt(
    explanation: string,
    componentMap: string,
    owner: string,
    repo: string
): string {
    return `<explanation>\n${explanation}\n</explanation>\n\n<component_mapping>\n${componentMap}\n</component_mapping>\n\nRepository: ${owner}/${repo}\nGitHub base URL for click events: https://github.com/${owner}/${repo}/blob/main/\n\nGenerate the complete Mermaid diagram code. Use the component mapping to create click events for every node. Output ONLY the Mermaid code, starting with "flowchart TB".`;
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
        // Step 1: Understand — analyze the codebase
        onProgress?.("understand", "Analyzing codebase architecture with AI...");

        const analysisRaw = await aiCompletion(
            ANALYSIS_SYSTEM_PROMPT,
            buildAnalysisUserPrompt(owner, repo, tree, readme),
            true,
            aiConfig
        );

        let architecture: ArchitectureAnalysis;
        try {
            architecture = JSON.parse(analysisRaw);
        } catch {
            throw new Error("Failed to parse AI analysis response as JSON");
        }

        // Step 2: GitDiagram-style 3-prompt chain for Mermaid generation
        try {
            // Prompt 1: Architecture explanation
            onProgress?.("explain", "Analyzing architecture (step 1/3)...");
            const explanation = await aiCompletion(
                EXPLAIN_SYSTEM_PROMPT,
                buildExplainPrompt(tree, readme),
                false,
                aiConfig
            );

            // Prompt 2: Component → file path mapping
            onProgress?.("mapping", "Mapping components to files (step 2/3)...");
            const componentMapRaw = await aiCompletion(
                MAPPING_SYSTEM_PROMPT,
                buildMappingPrompt(explanation, tree, owner, repo),
                true,
                aiConfig
            );

            // Prompt 3: Mermaid code generation
            onProgress?.("diagram", "Generating Mermaid diagram (step 3/3)...");
            const mermaidCode = await aiCompletion(
                MERMAID_GEN_SYSTEM_PROMPT,
                buildMermaidGenPrompt(explanation, componentMapRaw, owner, repo),
                false,
                aiConfig
            );

            // Strip markdown code fences if present
            architecture.mermaidDiagram = mermaidCode
                .replace(/^```mermaid\n?/i, "")
                .replace(/^```\n?/i, "")
                .replace(/\n?```$/i, "")
                .trim();
        } catch (err) {
            console.error("3-prompt Mermaid chain failed, using fallback generator:", err);
            // Mermaid generation failed but analysis succeeded — use fallback generator
            architecture.mermaidDiagram = generateMermaidFromTree(tree, owner, repo);
        }

        // Step 3: Enrich — annotate files
        onProgress?.("enrich", "Enriching file annotations...");

        const filePaths = tree.filter((t) => t.type === "blob").map((t) => t.path);
        const moduleNames = architecture.modules.map((m) => m.name);

        let annotations: FileAnnotation[];
        try {
            const annotationRaw = await aiCompletion(
                ANNOTATION_SYSTEM_PROMPT,
                buildAnnotationUserPrompt(filePaths, moduleNames),
                true,
                aiConfig
            );
            const parsed = JSON.parse(annotationRaw);
            annotations = parsed.annotations ?? [];
        } catch {
            // Annotation failed — return empty annotations
            annotations = [];
        }

        return { architecture, annotations, source: "ai" };
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
        const topDir = parts.length > 1 ? parts[0] : "root";
        const parentDir = parts.length > 2 ? parts.slice(0, -1).join("/") : topDir;

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
        const ext = fileName.split(".").pop() || "";
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
