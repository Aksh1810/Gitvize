// ============================================================================
// GitViz — AI Service Layer (Configurable Provider)
// ============================================================================

import { ArchitectureAnalysis, FileAnnotation, TreeItem } from "@/types";

// --- Provider Configuration ---

const AI_PROVIDER = process.env.AI_PROVIDER ?? "openai";
const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "gpt-4o";
const AI_BASE_URL =
    process.env.AI_BASE_URL ??
    (AI_PROVIDER === "anthropic"
        ? "https://api.anthropic.com/v1"
        : "https://api.openai.com/v1");

// --- Internal fetch helper ---

async function aiCompletion(
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    if (!AI_API_KEY) {
        throw new Error(
            "AI_API_KEY environment variable is not set. Please configure it to use AI features."
        );
    }

    if (AI_PROVIDER === "anthropic") {
        const res = await fetch(`${AI_BASE_URL}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": AI_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: AI_MODEL,
                max_tokens: 4096,
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

    // OpenAI / OpenAI-compatible
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            response_format: { type: "json_object" },
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

const ANALYSIS_SYSTEM_PROMPT = `You are a senior software architect analyzing a GitHub repository. Your job is to understand the codebase structure and produce a detailed architectural analysis.

You MUST respond with valid JSON matching the exact schema specified. Do not include any text outside the JSON object.`;

function buildAnalysisUserPrompt(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string
): string {
    // Limit tree to first 500 entries to avoid token overflow
    const trimmedTree = tree.slice(0, 500).map((t) => t.path);

    return `Analyze the GitHub repository "${owner}/${repo}".

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
  "techStack": ["string array of technologies/frameworks/languages used"],
  "architecturePattern": "string describing the architecture pattern (e.g. MVC, microservices, monolith, serverless, etc.)",
  "description": "2-3 sentence summary of what this project does and how it's built",
  "modules": [
    {
      "name": "human readable module name",
      "type": "one of: api, ui, database, config, utility, test, build, docs, core, middleware, service, model, controller, view, other",
      "description": "what this module does",
      "files": ["list of file paths that belong to this module"],
      "dependencies": ["names of other modules this depends on"],
      "entryPoint": "optional main file path"
    }
  ],
  "entryPoints": ["list of main entry point file paths"],
  "dataFlow": [
    {
      "from": "module name",
      "to": "module name",
      "description": "what data or control flows between them"
    }
  ]
}

Group files into logical modules (5-15 modules). Focus on high-level architecture, not individual files. Each file should belong to exactly one module.`;
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

// --- Pipeline Steps ---

export async function analyzeRepository(
    owner: string,
    repo: string,
    tree: TreeItem[],
    readme: string,
    onProgress?: (step: string, message: string) => void
): Promise<{ architecture: ArchitectureAnalysis; annotations: FileAnnotation[] }> {
    // Step 2: Understand
    onProgress?.("understand", "Analyzing codebase architecture with AI...");

    const analysisRaw = await aiCompletion(
        ANALYSIS_SYSTEM_PROMPT,
        buildAnalysisUserPrompt(owner, repo, tree, readme)
    );

    let architecture: ArchitectureAnalysis;
    try {
        architecture = JSON.parse(analysisRaw);
    } catch {
        throw new Error("Failed to parse AI analysis response as JSON");
    }

    // Step 3: Enrich
    onProgress?.("enrich", "Enriching file annotations...");

    const filePaths = tree.filter((t) => t.type === "blob").map((t) => t.path);
    const moduleNames = architecture.modules.map((m) => m.name);

    const annotationRaw = await aiCompletion(
        ANNOTATION_SYSTEM_PROMPT,
        buildAnnotationUserPrompt(filePaths, moduleNames)
    );

    let annotations: FileAnnotation[];
    try {
        const parsed = JSON.parse(annotationRaw);
        annotations = parsed.annotations ?? [];
    } catch {
        annotations = [];
    }

    return { architecture, annotations };
}

// --- Mock Analysis (for development without AI key) ---

export function getMockAnalysis(
    owner: string,
    repo: string,
    tree: TreeItem[]
): { architecture: ArchitectureAnalysis; annotations: FileAnnotation[] } {
    // Infer basic modules from directory structure
    const dirs = new Set<string>();
    tree.forEach((t) => {
        const parts = t.path.split("/");
        if (parts.length > 1) dirs.add(parts[0]);
    });

    const moduleTypes: Record<string, "api" | "ui" | "config" | "test" | "utility" | "core" | "docs" | "build"> = {
        src: "core",
        lib: "utility",
        app: "ui",
        api: "api",
        pages: "ui",
        components: "ui",
        test: "test",
        tests: "test",
        __tests__: "test",
        config: "config",
        docs: "docs",
        scripts: "build",
        public: "ui",
        styles: "ui",
        utils: "utility",
        helpers: "utility",
        models: "core",
        services: "api",
        middleware: "api",
        database: "core",
        db: "core",
    };

    const modules = Array.from(dirs).slice(0, 12).map((dir) => ({
        name: dir.charAt(0).toUpperCase() + dir.slice(1),
        type: moduleTypes[dir.toLowerCase()] ?? ("other" as const),
        description: `Contains ${tree.filter((t) => t.path.startsWith(dir + "/")).length} files`,
        files: tree
            .filter((t) => t.path.startsWith(dir + "/") && t.type === "blob")
            .map((t) => t.path)
            .slice(0, 20),
        dependencies: [] as string[],
    }));

    // Guess some cross-module dependencies
    if (modules.length > 1) {
        for (let i = 1; i < modules.length; i++) {
            modules[i].dependencies = [modules[0].name];
        }
    }

    const architecture: ArchitectureAnalysis = {
        techStack: inferTechStack(tree),
        architecturePattern: "Modular",
        description: `${owner}/${repo} — Analyzed ${tree.length} files across ${modules.length} modules.`,
        modules,
        entryPoints: tree
            .filter((t) => t.type === "blob")
            .filter(
                (t) =>
                    t.path.match(/^(index|main|app|server)\.(ts|js|tsx|jsx|py|go|rs)$/) !==
                    null
            )
            .map((t) => t.path)
            .slice(0, 5),
        dataFlow: modules.length > 1
            ? [{ from: modules[0].name, to: modules[1].name, description: "Primary data flow" }]
            : [],
    };

    const annotations: FileAnnotation[] = tree
        .filter((t) => t.type === "blob")
        .slice(0, 100)
        .map((t) => {
            const dir = t.path.split("/")[0];
            const mod = modules.find(
                (m) => m.name.toLowerCase() === dir.toLowerCase()
            );
            return {
                path: t.path,
                role: getFileRole(t.path),
                description: `File in ${dir}`,
                module: mod?.name ?? "Other",
            };
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
