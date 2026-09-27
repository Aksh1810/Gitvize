import assert from "node:assert/strict";
import { searchFiles } from "../src/lib/search-engine";
import { parseDependencyFile } from "../src/lib/dep-parser";
import { getPackageInfo } from "../src/components/diagrams/dependency-graph";
import { generateArchitectureMermaid, generateArchitectureOverview, generateMermaidFromTree } from "../src/lib/mermaid-generator";
import type { TreeItem } from "../src/types";

const tree: TreeItem[] = [
  { path: "package.json", type: "blob", mode: "100644", sha: "", url: "" },
  ...Array.from({ length: 500 }, (_, index) => ({ path: `src/components/Widget${index}.tsx`, type: "blob" as const, mode: "100644", sha: "", url: "" })),
];

assert.equal(searchFiles("package.json", tree)[0]?.path, "package.json");
const overview = generateMermaidFromTree(tree, "example", "repo");
assert.ok((overview.match(/^  click /gm) ?? []).length <= 28, "architecture overview should remain readable");
assert.ok((generateArchitectureOverview(tree).match(/\[".*files"\]/g) ?? []).length <= 7, "module overview should stay small");
assert.ok(generateArchitectureMermaid(null, tree, "example", "repo", "develop").includes("/blob/develop/package.json"));
assert.equal(parseDependencyFile("requirements.txt", "requests==2.0")[0]?.ecosystem, "pypi");
assert.equal(parseDependencyFile("go.mod", "require (\n github.com/acme/module v1.0.0\n)")[0]?.name, "github.com/acme/module");
assert.equal(getPackageInfo("react", "pypi").description, "");
assert.match(getPackageInfo("react", "npm").description, /interfaces/);
const collidingPaths = ["src/a-b.ts", "src/a_b.ts"].map((path) => ({ path, type: "blob" as const, mode: "100644", sha: "", url: "" }));
const nodeIds = [...generateMermaidFromTree(collidingPaths, "example", "repo").matchAll(/^  click (\w+) /gm)].map((match) => match[1]);
assert.equal(new Set(nodeIds).size, 2, "different paths must keep different Mermaid nodes");
console.log("UI data checks passed");
