import { describe, expect, it } from "vitest";
import {
  extractFileToFileImports,
  isAnalyzableCodeFile,
  isImportableCodeFile,
  selectSymbolAnalysisFiles,
} from "@/lib/symbol-parser";

type TreeLike = { path: string; type: "blob" | "tree"; size?: number };

describe("symbol-parser file filters", () => {
  it("matches analyzable/importable code file expectations", () => {
    expect(isAnalyzableCodeFile("src/app/page.tsx")).toBe(true);
    expect(isAnalyzableCodeFile("src/types/index.d.ts")).toBe(false);
    expect(isAnalyzableCodeFile("dist/bundle.js")).toBe(false);
    expect(isAnalyzableCodeFile("node_modules/pkg/index.js")).toBe(false);

    expect(isImportableCodeFile("src/server/main.go")).toBe(true);
    expect(isImportableCodeFile("src/types/index.d.ts")).toBe(false);
    expect(isImportableCodeFile("build/output.rs")).toBe(false);
  });
});

describe("selectSymbolAnalysisFiles", () => {
  it("enforces analyzable filtering, size limits, and repo-size limit strategy", () => {
    const tree: TreeLike[] = [
      { path: "src/main.ts", type: "blob", size: 1000 },
      { path: "src/huge.ts", type: "blob", size: 999999 },
      { path: "README.md", type: "blob", size: 200 },
      { path: "src/types.d.ts", type: "blob", size: 50 },
      { path: "src/utils.ts", type: "blob", size: 800 },
      { path: "src/feature.ts", type: "blob", size: 900 },
    ];

    const result = selectSymbolAnalysisFiles(tree, {
      maxFileBytes: 2000,
      smallLimit: 1,
      largeLimit: 2,
      largeRepoThreshold: 5,
    });

    expect(result.largeRepo).toBe(true);
    expect(result.limit).toBe(2);
    expect(result.skippedBySize).toBe(1);
    expect(result.skippedNotAnalyzable).toBe(2);
    expect(result.sourceFiles.map((f) => f.path)).toEqual(["src/main.ts", "src/feature.ts"]);
    expect(result.skippedByLimit).toBe(1);
  });
});

describe("extractFileToFileImports", () => {
  it("resolves relative TS imports and de-duplicates edges", () => {
    const files = [
      {
        path: "src/a.ts",
        content: [
          'import { helper } from "./utils";',
          'import { helper as helperAlias } from "./utils";',
          'import React from "react";',
        ].join("\n"),
      },
      {
        path: "src/index.ts",
        content: [
          'import utils from "./utils";',
          'import { helper } from "./utils";',
        ].join("\n"),
      },
      { path: "src/utils.ts", content: "export const helper = () => 1;" },
    ];

    const fileSet = new Set(["src/a.ts", "src/index.ts", "src/utils.ts"]);
    const edges = extractFileToFileImports(files, fileSet);

    expect(edges).toEqual([
      { fromFilePath: "src/a.ts", toFilePath: "src/utils.ts", confidence: "high" },
      { fromFilePath: "src/index.ts", toFilePath: "src/utils.ts", confidence: "high" },
    ]);
  });
});
