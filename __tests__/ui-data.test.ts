/** @jest-environment node */

import { searchFiles } from "@/lib/search-engine";
import { parseDependencyFile } from "@/lib/dep-parser";
import { getPackageInfo } from "@/components/diagrams/dependency-graph";
import {
  generateArchitectureMermaid,
  generateArchitectureOverview,
  generateMermaidFromTree,
} from "@/lib/mermaid-generator";
import type { TreeItem } from "@/types";

const tree: TreeItem[] = [
  { path: "package.json", type: "blob", mode: "100644", sha: "", url: "" },
  ...Array.from({ length: 500 }, (_, index) => ({
    path: `src/components/Widget${index}.tsx`,
    type: "blob" as const,
    mode: "100644",
    sha: "",
    url: "",
  })),
];

describe("file search", () => {
  it("ranks an exact filename first regardless of query case", () => {
    expect(searchFiles("PACKAGE.JSON", tree)[0]).toMatchObject({
      path: "package.json",
      matchType: "exact",
    });
  });

  it("limits results and ignores directories", () => {
    const directory: TreeItem = { path: "Widget", type: "tree", mode: "040000", sha: "", url: "" };
    const results = searchFiles("Widget", [directory, ...tree], 3);
    expect(results).toHaveLength(3);
    expect(results.every(({ path }) => path.endsWith(".tsx"))).toBe(true);
  });

  it("returns no results for empty or unmatched queries", () => {
    expect(searchFiles("", tree)).toEqual([]);
    expect(searchFiles("no-such-file", tree)).toEqual([]);
  });
});

describe("architecture diagrams", () => {
  it("keeps large repository diagrams readable", () => {
    const diagram = generateMermaidFromTree(tree, "example", "repo");
    const links = diagram.match(/^  click /gm) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(28);

    const modules = generateArchitectureOverview(tree).match(/\[".*files"\]/g) ?? [];
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.length).toBeLessThanOrEqual(7);
  });

  it.each(["develop", "feature/ui"])("links to the repository branch %s", (branch) => {
    const diagram = generateArchitectureMermaid(null, tree, "example", "repo", branch);
    expect(diagram).toContain(`/blob/${encodeURIComponent(branch)}/package.json`);
    expect(diagram).not.toContain("/blob/main/");
  });

  it("keeps paths with similar punctuation as distinct clickable nodes", () => {
    const paths = ["src/a-b.ts", "src/a_b.ts", "src/a_x2d_b.ts"];
    const files = paths.map((path) => ({ ...tree[0], path }));
    const diagram = generateMermaidFromTree(files, "example", "repo");
    const ids = [...diagram.matchAll(/^  click (\w+) /gm)].map((match) => match[1]);
    expect(ids).toHaveLength(paths.length);
    expect(new Set(ids).size).toBe(paths.length);
    for (const path of paths) expect(diagram).toContain(`/blob/main/${path}`);
  });
});

describe("dependency data", () => {
  it("distinguishes runtime and development npm dependencies", () => {
    const manifest = JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { jest: "^30" } });
    expect(parseDependencyFile("package.json", manifest)).toEqual([
      { name: "react", version: "^19", isDirect: true, ecosystem: "npm" },
      { name: "jest", version: "^30", isDirect: false, ecosystem: "npm" },
    ]);
  });

  it("ignores malformed JSON and unsupported manifests", () => {
    expect(parseDependencyFile("package.json", "{broken")).toEqual([]);
    expect(parseDependencyFile("unknown.txt", "requests==2.0")).toEqual([]);
  });

  it("labels Python dependencies and skips comments", () => {
    expect(parseDependencyFile("requirements.txt", "# HTTP client\nrequests==2.0\n")).toEqual([
      { name: "requests", version: "2.0", isDirect: true, ecosystem: "pypi" },
    ]);
  });

  it("preserves Go module paths and marks indirect dependencies", () => {
    const manifest = "require (\n github.com/acme/module v1.0.0\n golang.org/x/text v0.3.0 // indirect\n)";
    expect(parseDependencyFile("go.mod", manifest)).toEqual([
      { name: "github.com/acme/module", version: "v1.0.0", isDirect: true, ecosystem: "go" },
      { name: "golang.org/x/text", version: "v0.3.0", isDirect: false, ecosystem: "go" },
    ]);
  });

  it("keeps metadata scoped to its package ecosystem", () => {
    expect(getPackageInfo("react", "npm").description).toMatch(/interfaces/);
    expect(getPackageInfo("react", "pypi").description).toBe("");
  });
});
