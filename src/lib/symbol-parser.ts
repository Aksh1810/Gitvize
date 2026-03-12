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
