import { describe, expect, it } from "vitest";
import { selectImportantTreeItems } from "@/lib/graph-builder";
import type { TreeItem } from "@/types";

function file(path: string): TreeItem {
  return {
    path,
    mode: "100644",
    type: "blob",
    sha: `${path}-sha`,
    size: 100,
    url: `https://example.com/${path}`,
  };
}

describe("selectImportantTreeItems", () => {
  it("returns original tree unchanged when under limit", () => {
    const tree = [file("README.md"), file("src/index.ts")];
    const result = selectImportantTreeItems(tree, 5);

    expect(result).toBe(tree);
  });

  it("prefers priority directories and code files when trimming", () => {
    const tree = [
      file("docs/guide.md"),
      file("src/index.ts"),
      file("assets/logo.png"),
      file("tests/service.test.ts"),
      file(".github/workflows/ci.yml"),
    ];

    const result = selectImportantTreeItems(tree, 2);
    const paths = result.map((item) => item.path);

    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("tests/service.test.ts");
    expect(paths).not.toContain(".github/workflows/ci.yml");
  });

  it("de-prioritizes test and hidden paths against higher-signal files", () => {
    const tree = [
      file("src/core/engine.ts"),
      file("app/page.tsx"),
      file("tests/engine.spec.ts"),
      file(".cache/runtime.json"),
      file("docs/readme.md"),
    ];

    const result = selectImportantTreeItems(tree, 3);
    const paths = result.map((item) => item.path);

    expect(paths).toContain("src/core/engine.ts");
    expect(paths).toContain("app/page.tsx");
    expect(paths).not.toContain(".cache/runtime.json");
  });
});
