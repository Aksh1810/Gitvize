export type SymbolKind = "class" | "function" | "interface" | "type" | "method" | "variable";

export interface ExtractedSymbol {
    name: string;
    kind: SymbolKind;
    filePath: string;
}

export interface SymbolReference {
    fromFilePath: string;
    fromSymbolName?: string;
    fromSymbolKind?: SymbolKind;
    toFilePath: string;
    symbolName: string;
    targetKind: SymbolKind;
    relation: "imports" | "calls" | "extends" | "implements";
    confidence: "high" | "medium";
}

export interface SymbolGraphData {
    symbols: ExtractedSymbol[];
    references: SymbolReference[];
}

export interface SymbolFileSelectionResult<T extends { path: string; type: string; size?: number }> {
    sourceFiles: T[];
    candidateCount: number;
    skippedByLimit: number;
    skippedBySize: number;
    skippedNotAnalyzable: number;
    totalBlobCount: number;
    largeRepo: boolean;
    limit: number;
}

interface ParseContext {
    symbols: ExtractedSymbol[];
    symbolsByName: Map<string, ExtractedSymbol[]>;
    fileSet: Set<string>;
}

const JS_TS_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"]);
const IDENTIFIER = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const COMMON_IGNORE_NAMES = new Set([
    "default",
    "props",
    "state",
    "data",
    "result",
    "value",
    "values",
    "item",
    "items",
    "index",
    "config",
    "options",
    "request",
    "response",
    "error",
    "handler",
    "event",
    "node",
    "edge",
    "map",
    "set",
    "list",
]);

const PRIORITY_FILE_NAMES = [
    "index",
    "main",
    "app",
    "server",
    "client",
    "route",
    "layout",
    "page",
    "entry",
    "config",
];

const PRIORITY_FOLDER_NAMES = [
    "src",
    "app",
    "lib",
    "components",
    "api",
    "core",
    "services",
    "utils",
];

export function isAnalyzableCodeFile(path: string): boolean {
    const lowered = path.toLowerCase();
    if (lowered.endsWith(".d.ts") || lowered.includes("/dist/") || lowered.includes("/build/") || lowered.includes("/node_modules/")) {
        return false;
    }

    const ext = lowered.split(".").pop() ?? "";
    return JS_TS_EXTENSIONS.has(ext);
}

export function buildSymbolGraph(fileContents: Array<{ path: string; content: string }>, options?: { maxReferences?: number }): SymbolGraphData {
    const context = buildParseContext(fileContents);
    const references = extractReferences(fileContents, context, options?.maxReferences ?? 400);
    return {
        symbols: context.symbols,
        references,
    };
}

export function selectSymbolAnalysisFiles<T extends { path: string; type: string; size?: number }>(
    tree: T[],
    options?: {
        maxFileBytes?: number;
        smallLimit?: number;
        largeLimit?: number;
        largeRepoThreshold?: number;
    }
): SymbolFileSelectionResult<T> {
    const maxFileBytes = options?.maxFileBytes ?? 120_000;
    const smallLimit = options?.smallLimit ?? 50;
    const largeLimit = options?.largeLimit ?? 100;
    const largeRepoThreshold = options?.largeRepoThreshold ?? 800;

    const blobs = tree.filter((item) => item.type === "blob");
    const totalBlobCount = blobs.length;
    const largeRepo = tree.length > largeRepoThreshold;
    const limit = largeRepo ? largeLimit : smallLimit;

    let skippedNotAnalyzable = 0;
    let skippedBySize = 0;

    const candidates = blobs
        .filter((item) => {
            if (!isAnalyzableCodeFile(item.path)) {
                skippedNotAnalyzable += 1;
                return false;
            }

            if ((item.size ?? 0) > maxFileBytes) {
                skippedBySize += 1;
                return false;
            }

            return true;
        })
        .sort((a, b) => {
            const scoreDiff = scoreFilePriority(b.path) - scoreFilePriority(a.path);
            if (scoreDiff !== 0) return scoreDiff;

            const sizeA = a.size ?? Number.MAX_SAFE_INTEGER;
            const sizeB = b.size ?? Number.MAX_SAFE_INTEGER;
            if (sizeA !== sizeB) return sizeA - sizeB;

            return a.path.localeCompare(b.path);
        });

    const sourceFiles = candidates.slice(0, limit);

    return {
        sourceFiles,
        candidateCount: candidates.length,
        skippedByLimit: Math.max(0, candidates.length - sourceFiles.length),
        skippedBySize,
        skippedNotAnalyzable,
        totalBlobCount,
        largeRepo,
        limit,
    };
}

function buildParseContext(fileContents: Array<{ path: string; content: string }>): ParseContext {
    const symbols: ExtractedSymbol[] = [];
    const symbolsByName = new Map<string, ExtractedSymbol[]>();
    const fileSet = new Set<string>();

    for (const file of fileContents) {
        fileSet.add(file.path);
        const declarations = extractDeclarations(file.path, file.content);
        declarations.forEach((symbol) => {
            symbols.push(symbol);
            const existing = symbolsByName.get(symbol.name) ?? [];
            existing.push(symbol);
            symbolsByName.set(symbol.name, existing);
        });
    }

    return { symbols, symbolsByName, fileSet };
}

function extractDeclarations(filePath: string, content: string): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const seen = new Set<string>();
    const stripped = stripCommentsAndStrings(content);

    const add = (kind: SymbolKind, name: string) => {
        if (!name || name.length < 2) return;
        if (COMMON_IGNORE_NAMES.has(name.toLowerCase())) return;
        const key = `${kind}:${name}`;
        if (seen.has(key)) return;
        seen.add(key);
        symbols.push({ name, kind, filePath });
    };

    forEachMatch(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g, stripped, (name) => add("class", name));
    forEachMatch(/\b(?:export\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, stripped, (name) => add("function", name));
    forEachMatch(/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>/g, stripped, (name) => add("function", name));
    forEachMatch(/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g, stripped, (name) => add("interface", name));
    forEachMatch(/\btype\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, stripped, (name) => add("type", name));

    forEachMatch(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=.+$/gm, stripped, (name) => {
        const maybeFunction = new RegExp(`\\b${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_][A-Za-z0-9_]*)\\s*=>`).test(stripped);
        if (!maybeFunction) add("variable", name);
    });

    forEachMatch(/^\s*(?:public|private|protected|static|async|get|set|readonly|\s)+\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^\n;)]*\)\s*\{/gm, stripped, (name) => {
        if (name !== "constructor") add("method", name);
    });

    return symbols;
}

function extractReferences(
    fileContents: Array<{ path: string; content: string }>,
    context: ParseContext,
    maxReferences: number
): SymbolReference[] {
    const references: SymbolReference[] = [];
    const seenRefs = new Set<string>();

    for (const file of fileContents) {
        if (references.length >= maxReferences) break;

        const classRelations = parseClassRelations(file.path, file.content, context.symbolsByName);
        for (const rel of classRelations) {
            if (references.length >= maxReferences) break;
            const key = `${rel.fromFilePath}->${rel.toFilePath}:${rel.relation}:${rel.symbolName}`;
            if (seenRefs.has(key)) continue;
            seenRefs.add(key);
            references.push(rel);
        }

        const imported = parseImportedIdentifiers(file.path, file.content, context.fileSet);
        for (const imp of imported) {
            if (references.length >= maxReferences) break;
            const targets = context.symbolsByName.get(imp.symbolName) ?? [];
            for (const target of targets) {
                if (target.filePath !== imp.targetPath) continue;
                if (target.filePath === file.path) continue;
                const key = `${file.path}->${target.filePath}:${target.kind}:${target.name}`;
                if (seenRefs.has(key)) continue;
                seenRefs.add(key);
                references.push({
                    fromFilePath: file.path,
                    toFilePath: target.filePath,
                    symbolName: target.name,
                    targetKind: target.kind,
                    relation: "imports",
                    confidence: "high",
                });
            }
        }

        // Medium-confidence fallback: identifier usage scan for symbols not imported explicitly.
        if (references.length >= maxReferences) continue;
        const declarationsInFile = new Set(
            context.symbols
                .filter((s) => s.filePath === file.path)
                .map((s) => s.name)
        );

        const stripped = stripCommentsAndStrings(file.content);
        const tokenCounts = countIdentifiers(stripped);
        for (const [token, count] of tokenCounts) {
            if (references.length >= maxReferences) break;
            if (token.length < 3 || count < 2 || count > 40) continue;
            if (COMMON_IGNORE_NAMES.has(token.toLowerCase())) continue;
            if (declarationsInFile.has(token)) continue;

            const targets = context.symbolsByName.get(token) ?? [];
            for (const target of targets) {
                if (target.filePath === file.path) continue;
                const key = `${file.path}->${target.filePath}:${target.kind}:${target.name}`;
                if (seenRefs.has(key)) continue;
                seenRefs.add(key);
                const isCall = new RegExp(`\\b${escapeRegExp(token)}\\s*\\(`).test(stripped);
                references.push({
                    fromFilePath: file.path,
                    toFilePath: target.filePath,
                    symbolName: target.name,
                    targetKind: target.kind,
                    relation: isCall ? "calls" : "imports",
                    confidence: "medium",
                });
                break;
            }
        }
    }

    return references;
}

function parseClassRelations(
    filePath: string,
    content: string,
    symbolMap: Map<string, ExtractedSymbol[]>
): SymbolReference[] {
    const refs: SymbolReference[] = [];
    const stripped = stripCommentsAndStrings(content);
    const classRegex = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:extends\s+([A-Za-z_][A-Za-z0-9_]*))?\s*(?:implements\s+([A-Za-z0-9_,\s]+))?/g;

    let match: RegExpExecArray | null;
    while ((match = classRegex.exec(stripped)) !== null) {
        const className = match[1];
        const extendsName = match[2];
        const implementsBlock = match[3];

        if (extendsName) {
            const targets = symbolMap.get(extendsName) ?? [];
            targets.forEach((target) => {
                if (target.filePath === filePath) return;
                refs.push({
                    fromFilePath: filePath,
                    fromSymbolName: className,
                    fromSymbolKind: "class",
                    toFilePath: target.filePath,
                    symbolName: target.name,
                    targetKind: target.kind,
                    relation: "extends",
                    confidence: "high",
                });
            });
        }

        if (implementsBlock) {
            implementsBlock
                .split(/[,\s]+/)
                .map((name) => name.trim())
                .filter(Boolean)
                .forEach((implName) => {
                    const targets = symbolMap.get(implName) ?? [];
                    targets.forEach((target) => {
                        if (target.filePath === filePath) return;
                        refs.push({
                            fromFilePath: filePath,
                            fromSymbolName: className,
                            fromSymbolKind: "class",
                            toFilePath: target.filePath,
                            symbolName: target.name,
                            targetKind: target.kind,
                            relation: "implements",
                            confidence: "high",
                        });
                    });
                });
        }
    }

    return refs;
}

function parseImportedIdentifiers(filePath: string, content: string, fileSet: Set<string>): Array<{ symbolName: string; targetPath: string }> {
    const refs: Array<{ symbolName: string; targetPath: string }> = [];
    const importRegex = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
        const clause = (match[1] ?? "").trim();
        const source = (match[2] ?? "").trim();
        const resolved = resolveImportPath(filePath, source, fileSet);
        if (!resolved) continue;

        const symbols = parseImportClause(clause);
        symbols.forEach((symbolName) => {
            refs.push({ symbolName, targetPath: resolved });
        });
    }

    return refs;
}

function parseImportClause(clause: string): string[] {
    const names: string[] = [];

    if (clause.startsWith("{")) {
        const inner = clause.slice(1, clause.lastIndexOf("}"));
        inner
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => {
                const [left, alias] = part.split(/\s+as\s+/i).map((x) => x.trim());
                names.push(alias || left);
            });
        return names;
    }

    if (clause.includes("{")) {
        const [defaultPart, namedPart] = clause.split("{");
        const defaultName = defaultPart.replace(",", "").trim();
        if (defaultName) names.push(defaultName);
        const inner = namedPart.slice(0, namedPart.lastIndexOf("}"));
        inner
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => {
                const [left, alias] = part.split(/\s+as\s+/i).map((x) => x.trim());
                names.push(alias || left);
            });
        return names;
    }

    const defaultOnly = clause.trim();
    if (defaultOnly && defaultOnly !== "*") {
        names.push(defaultOnly.replace(/\*\s+as\s+/, "").trim());
    }

    return names.filter((name) => !!name && name !== "default");
}

function resolveImportPath(currentFilePath: string, specifier: string, fileSet: Set<string>): string | null {
    if (!specifier.startsWith(".")) return null;

    const baseParts = currentFilePath.split("/");
    baseParts.pop(); // remove filename

    const importParts = specifier.split("/");
    for (const part of importParts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            baseParts.pop();
        } else {
            baseParts.push(part);
        }
    }

    const base = baseParts.join("/");
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
        `${base}/index.jsx`,
    ];

    for (const candidate of candidates) {
        if (fileSet.has(candidate)) return candidate;
    }

    return null;
}

function stripCommentsAndStrings(input: string): string {
    return input
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|\s)\/\/.*$/gm, "$1 ")
        .replace(/`(?:\\.|[^`\\])*`/g, " `str` ")
        .replace(/"(?:\\.|[^"\\])*"/g, ' "str" ')
        .replace(/'(?:\\.|[^'\\])*'/g, " 'str' ");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countIdentifiers(content: string): Map<string, number> {
    const counts = new Map<string, number>();
    let match: RegExpExecArray | null;
    while ((match = IDENTIFIER.exec(content)) !== null) {
        const token = match[0];
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return counts;
}

function forEachMatch(regex: RegExp, input: string, onMatch: (name: string) => void) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
        const name = match[1];
        if (name) onMatch(name);
    }
}

// ── Multi-language file-to-file import extraction ─────────────────────────────

export interface FileImportEdge {
    fromFilePath: string;
    toFilePath: string;
    confidence: "high" | "medium";
}

const IMPORTABLE_CODE_EXTENSIONS = new Set([
    "ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs",
    "py", "go", "rs", "java", "c", "cpp", "cc", "cxx", "h", "hpp", "cs",
]);

/** Returns true for source code files across all supported languages. */
export function isImportableCodeFile(path: string): boolean {
    const lowered = path.toLowerCase();
    if (
        lowered.endsWith(".d.ts") ||
        lowered.includes("/dist/") ||
        lowered.includes("/build/") ||
        lowered.includes("/node_modules/")
    ) {
        return false;
    }
    const ext = lowered.split(".").pop() ?? "";
    return IMPORTABLE_CODE_EXTENSIONS.has(ext);
}

/**
 * Extract direct file-to-file import relationships across all supported languages.
 * JS/TS uses the existing relative-path import resolver.
 * Other languages use language-specific heuristics.
 */
export function extractFileToFileImports(
    fileContents: Array<{ path: string; content: string }>,
    fileSet: Set<string>,
): FileImportEdge[] {
    const edges: FileImportEdge[] = [];
    const seen = new Set<string>();

    function addEdge(from: string, to: string, confidence: "high" | "medium") {
        if (from === to) return;
        const key = `${from}\0${to}`;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ fromFilePath: from, toFilePath: to, confidence });
    }

    for (const { path: filePath, content } of fileContents) {
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

        if (JS_TS_EXTENSIONS.has(ext)) {
            // Reuse existing resolver — deduplicate to one edge per file pair
            const imported = parseImportedIdentifiers(filePath, content, fileSet);
            const resolved = new Set<string>();
            for (const { targetPath } of imported) {
                if (!resolved.has(targetPath)) {
                    resolved.add(targetPath);
                    addEdge(filePath, targetPath, "high");
                }
            }
        } else if (ext === "py") {
            for (const to of parsePythonFileImports(filePath, content, fileSet)) {
                addEdge(filePath, to, "high");
            }
        } else if (ext === "go") {
            for (const to of parseGoFileImports(filePath, content, fileSet)) {
                addEdge(filePath, to, "medium");
            }
        } else if (ext === "rs") {
            for (const to of parseRustModDecls(filePath, content, fileSet)) {
                addEdge(filePath, to, "high");
            }
        } else if (ext === "java") {
            for (const to of parseJavaFileImports(filePath, content, fileSet)) {
                addEdge(filePath, to, "medium");
            }
        } else if (["c", "cpp", "cc", "cxx", "h", "hpp"].includes(ext)) {
            for (const to of parseCFileIncludes(filePath, content, fileSet)) {
                addEdge(filePath, to, "high");
            }
        } else if (ext === "cs") {
            for (const to of parseCSharpFileUsings(filePath, content, fileSet)) {
                addEdge(filePath, to, "medium");
            }
        }
    }

    return edges;
}

/** Python: relative imports `from .mod import X` and sibling `import mod`. */
function parsePythonFileImports(filePath: string, content: string, fileSet: Set<string>): string[] {
    const results: string[] = [];
    const baseParts = filePath.split("/").slice(0, -1);

    const relFromRe = /^from\s+(\.+)(\S*)\s+import/gm;
    let m: RegExpExecArray | null;
    while ((m = relFromRe.exec(content)) !== null) {
        const levels = m[1].length - 1;
        const modPath = m[2] ?? "";
        const base = baseParts.slice(0, Math.max(0, baseParts.length - levels));
        if (modPath) base.push(...modPath.split(".").filter(Boolean));
        const joined = base.join("/");
        const candidates = [`${joined}.py`, `${joined}/__init__.py`];
        for (const c of candidates) {
            if (fileSet.has(c)) { results.push(c); break; }
        }
    }

    const directImportRe = /^import\s+(\w+)/gm;
    while ((m = directImportRe.exec(content)) !== null) {
        const candidate = [...baseParts, `${m[1]}.py`].join("/");
        if (fileSet.has(candidate)) results.push(candidate);
    }

    return results;
}

/** Go: match import path suffixes against known directories containing .go files. */
function parseGoFileImports(filePath: string, content: string, fileSet: Set<string>): string[] {
    const importPaths: string[] = [];

    const singleRe = /\bimport\s+"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = singleRe.exec(content)) !== null) importPaths.push(m[1]);

    const blockRe = /\bimport\s+\(([^)]+)\)/g;
    while ((m = blockRe.exec(content)) !== null) {
        const pathRe = /"([^"]+)"/g;
        let pm: RegExpExecArray | null;
        while ((pm = pathRe.exec(m[1])) !== null) importPaths.push(pm[1]);
    }

    // Build dir → first .go file in that dir
    const dirToGoFile = new Map<string, string>();
    for (const f of fileSet) {
        if (!f.endsWith(".go")) continue;
        const dir = f.split("/").slice(0, -1).join("/");
        if (!dirToGoFile.has(dir)) dirToGoFile.set(dir, f);
    }

    const results: string[] = [];
    for (const importPath of importPaths) {
        const parts = importPath.split("/");
        for (let n = 1; n <= Math.min(3, parts.length); n++) {
            const suffix = parts.slice(-n).join("/");
            for (const [dir, f] of dirToGoFile) {
                if (f !== filePath && (dir === suffix || dir.endsWith(`/${suffix}`))) {
                    if (!results.includes(f)) results.push(f);
                    break;
                }
            }
        }
    }
    return results;
}

/** Rust: `mod name;` declarations — resolve to name.rs or name/mod.rs. */
function parseRustModDecls(filePath: string, content: string, fileSet: Set<string>): string[] {
    const results: string[] = [];
    const baseParts = filePath.split("/").slice(0, -1);
    const modRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm;
    let m: RegExpExecArray | null;
    while ((m = modRe.exec(content)) !== null) {
        const name = m[1];
        const c1 = [...baseParts, `${name}.rs`].join("/");
        const c2 = [...baseParts, name, "mod.rs"].join("/");
        if (fileSet.has(c1)) results.push(c1);
        else if (fileSet.has(c2)) results.push(c2);
    }
    return results;
}

/** Java: `import pkg.ClassName` → find ClassName.java anywhere in the repo. */
function parseJavaFileImports(filePath: string, content: string, fileSet: Set<string>): string[] {
    const results: string[] = [];
    const importRe = /^import\s+(?:static\s+)?([A-Za-z_$][A-Za-z0-9_$.]*);/gm;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
        const parts = m[1].split(".");
        const className = parts[parts.length - 1];
        if (!className || className === "*") continue;
        for (const f of fileSet) {
            if (f !== filePath && (f.endsWith(`/${className}.java`) || f === `${className}.java`)) {
                if (!results.includes(f)) results.push(f);
                break;
            }
        }
    }
    return results;
}

/** C/C++: relative `#include "path/to/file.h"` only (not system includes). */
function parseCFileIncludes(filePath: string, content: string, fileSet: Set<string>): string[] {
    const results: string[] = [];
    const baseParts = filePath.split("/").slice(0, -1);
    const re = /^#include\s+"([^"]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const parts = m[1].split("/");
        const resolved = [...baseParts];
        for (const p of parts) {
            if (p === "..") resolved.pop();
            else if (p && p !== ".") resolved.push(p);
        }
        const candidate = resolved.join("/");
        if (fileSet.has(candidate) && candidate !== filePath) results.push(candidate);
    }
    return results;
}

/** C#: `using Namespace.ClassName` → find ClassName.cs anywhere in the repo. */
function parseCSharpFileUsings(filePath: string, content: string, fileSet: Set<string>): string[] {
    const results: string[] = [];
    const re = /^using\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const parts = m[1].split(".");
        const name = parts[parts.length - 1];
        if (!name) continue;
        for (const f of fileSet) {
            if (f !== filePath && (f.endsWith(`/${name}.cs`) || f === `${name}.cs`)) {
                if (!results.includes(f)) results.push(f);
                break;
            }
        }
    }
    return results;
}

function scoreFilePriority(path: string): number {
    const lowered = path.toLowerCase();
    const parts = lowered.split("/");
    const file = parts[parts.length - 1] ?? "";
    const baseName = file.split(".")[0] ?? "";

    let score = 0;

    if (PRIORITY_FILE_NAMES.includes(baseName)) {
        score += 120;
    }

    for (const folder of PRIORITY_FOLDER_NAMES) {
        if (parts.includes(folder)) {
            score += 25;
        }
    }

    // Favor shallower files as likely entry or orchestration points.
    score += Math.max(0, 12 - parts.length);

    if (lowered.includes("test") || lowered.includes("spec")) {
        score -= 20;
    }

    return score;
}
