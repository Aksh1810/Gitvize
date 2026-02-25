// ============================================================================
// GitViz — Dependency File Parsers
// ============================================================================

export interface ParsedDependency {
    name: string;
    version: string;
    isDirect: boolean;
}

export function parseDependencyFile(
    filename: string,
    content: string
): ParsedDependency[] {
    switch (filename) {
        case "package.json":
            return parsePackageJson(content);
        case "requirements.txt":
            return parseRequirementsTxt(content);
        case "go.mod":
            return parseGoMod(content);
        case "Cargo.toml":
            return parseCargoToml(content);
        case "pyproject.toml":
            return parsePyprojectToml(content);
        default:
            return [];
    }
}

function parsePackageJson(content: string): ParsedDependency[] {
    try {
        const pkg = JSON.parse(content);
        const deps: ParsedDependency[] = [];

        if (pkg.dependencies) {
            Object.entries(pkg.dependencies).forEach(([name, version]) => {
                deps.push({ name, version: String(version), isDirect: true });
            });
        }

        if (pkg.devDependencies) {
            Object.entries(pkg.devDependencies).forEach(([name, version]) => {
                deps.push({ name, version: String(version), isDirect: false });
            });
        }

        return deps;
    } catch {
        return [];
    }
}

function parseRequirementsTxt(content: string): ParsedDependency[] {
    return content
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#") && !line.startsWith("-"))
        .map((line) => {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*(?:[>=<!~]+\s*(.+))?/);
            if (!match) return null;
            return {
                name: match[1],
                version: match[2]?.trim() ?? "*",
                isDirect: true,
            };
        })
        .filter((d): d is ParsedDependency => d !== null);
}

function parseGoMod(content: string): ParsedDependency[] {
    const deps: ParsedDependency[] = [];
    const lines = content.split("\n");
    let inRequire = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "require (") {
            inRequire = true;
            continue;
        }
        if (trimmed === ")") {
            inRequire = false;
            continue;
        }
        if (inRequire) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const name = parts[0].split("/").pop() ?? parts[0];
                deps.push({
                    name,
                    version: parts[1],
                    isDirect: !trimmed.includes("// indirect"),
                });
            }
        }
    }

    return deps;
}

function parseCargoToml(content: string): ParsedDependency[] {
    const deps: ParsedDependency[] = [];
    const lines = content.split("\n");
    let inDeps = false;
    let isDev = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "[dependencies]") {
            inDeps = true;
            isDev = false;
            continue;
        }
        if (trimmed === "[dev-dependencies]") {
            inDeps = true;
            isDev = true;
            continue;
        }
        if (trimmed.startsWith("[") && trimmed !== "[dependencies]") {
            inDeps = false;
            continue;
        }
        if (inDeps && trimmed.includes("=")) {
            const [name, rest] = trimmed.split("=").map((s) => s.trim());
            const version = rest.replace(/["{},]/g, "").trim();
            deps.push({
                name,
                version: version || "*",
                isDirect: !isDev,
            });
        }
    }

    return deps;
}

function parsePyprojectToml(content: string): ParsedDependency[] {
    const deps: ParsedDependency[] = [];
    const lines = content.split("\n");
    let inDeps = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "dependencies = [" || trimmed === 'dependencies = [') {
            inDeps = true;
            continue;
        }
        if (inDeps && trimmed === "]") {
            inDeps = false;
            continue;
        }
        if (inDeps) {
            const clean = trimmed.replace(/[",]/g, "").trim();
            if (clean) {
                const match = clean.match(/^([a-zA-Z0-9_-]+)\s*(?:[>=<!~]+\s*(.+))?/);
                if (match) {
                    deps.push({
                        name: match[1],
                        version: match[2]?.trim() ?? "*",
                        isDirect: true,
                    });
                }
            }
        }
    }

    return deps;
}
