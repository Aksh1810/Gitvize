import { describe, expect, it } from "vitest";
import { parseDependencyFile } from "@/lib/dep-parser";

describe("parseDependencyFile", () => {
  it("parses package.json dependencies and devDependencies", () => {
    const content = JSON.stringify({
      dependencies: { react: "^19.2.3", zod: "^4.3.6" },
      devDependencies: { vitest: "^4.1.10" },
    });

    expect(parseDependencyFile("package.json", content)).toEqual([
      { name: "react", version: "^19.2.3", isDirect: true },
      { name: "zod", version: "^4.3.6", isDirect: true },
      { name: "vitest", version: "^4.1.10", isDirect: false },
    ]);
  });

  it("returns empty array for invalid package.json", () => {
    expect(parseDependencyFile("package.json", "{invalid-json")).toEqual([]);
  });

  it("parses requirements.txt and ignores comments/options", () => {
    const content = [
      "# comment",
      "-r base.txt",
      "fastapi==0.115.0",
      "requests>=2.31.0",
      "uvicorn",
      "",
    ].join("\n");

    expect(parseDependencyFile("requirements.txt", content)).toEqual([
      { name: "fastapi", version: "0.115.0", isDirect: true },
      { name: "requests", version: "2.31.0", isDirect: true },
      { name: "uvicorn", version: "*", isDirect: true },
    ]);
  });

  it("parses go.mod direct and indirect dependencies", () => {
    const content = [
      "module example.com/app",
      "",
      "go 1.22",
      "",
      "require (",
      "  github.com/lib/pq v1.10.9",
      "  golang.org/x/text v0.14.0 // indirect",
      ")",
    ].join("\n");

    expect(parseDependencyFile("go.mod", content)).toEqual([
      { name: "pq", version: "v1.10.9", isDirect: true },
      { name: "text", version: "v0.14.0", isDirect: false },
    ]);
  });
});
