import { buildSymbolGraph, extractFileToFileImports } from "@/lib/symbol-parser";
import type { SymbolGraphData, FileImportEdge } from "@/lib/symbol-parser";

type WorkerInput =
    | {
          type: "buildSymbolGraph";
          fileContents: Array<{ path: string; content: string }>;
          maxReferences?: number;
      }
    | {
          type: "extractFileToFileImports";
          fileContents: Array<{ path: string; content: string }>;
          fileSet: string[];
      };

type WorkerOutput =
    | { type: "symbolGraph"; data: SymbolGraphData }
    | { type: "importEdges"; data: FileImportEdge[] };

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const msg = e.data;

    if (msg.type === "buildSymbolGraph") {
        const data = buildSymbolGraph(msg.fileContents, { maxReferences: msg.maxReferences });
        const out: WorkerOutput = { type: "symbolGraph", data };
        self.postMessage(out);
    } else if (msg.type === "extractFileToFileImports") {
        const fileSet = new Set(msg.fileSet);
        const data = extractFileToFileImports(msg.fileContents, fileSet);
        const out: WorkerOutput = { type: "importEdges", data };
        self.postMessage(out);
    }
};
