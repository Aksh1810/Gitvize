import { NextRequest, NextResponse } from "next/server";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { fetchAllRepoData } from "@/lib/github";
import { selectImportantTreeItems } from "@/lib/graph-builder";
import { getCachedSeed, setCachedSeed, type SeedPositions } from "@/lib/graph-cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { TreeItem } from "@/types";

export const maxDuration = 30;

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const SEED_TTL_SEC = 60 * 60 * 24;

// IDs MUST match the conventions used by `file-tree-graph.tsx` so the client
// can apply seed positions by node id without a translation layer:
//   root → "root"; folder → `folder:${path}`; file → `file:${path}`.
function buildFileTreeSeedGraph(items: TreeItem[]): Graph {
    const graph = new Graph({ multi: false, type: "directed" });
    const root = "root";
    graph.addNode(root, { x: 0, y: 0 });

    const folders = new Set<string>();

    const seedXY = () => ({
        x: (Math.random() - 0.5) * 800,
        y: (Math.random() - 0.5) * 800,
    });

    const addFolderChain = (folderPath: string) => {
        const parts = folderPath.split("/");
        for (let i = 1; i <= parts.length; i++) {
            const sub = parts.slice(0, i).join("/");
            if (!sub || folders.has(sub)) continue;
            folders.add(sub);
            const id = `folder:${sub}`;
            if (!graph.hasNode(id)) graph.addNode(id, seedXY());
            const parentSub = parts.slice(0, i - 1).join("/");
            const parentId = parentSub ? `folder:${parentSub}` : root;
            if (graph.hasNode(parentId) && !graph.hasEdge(parentId, id)) {
                graph.addEdge(parentId, id);
            }
        }
    };

    for (const item of items) {
        const parts = item.path.split("/");
        const parentFolder = parts.slice(0, -1).join("/");
        if (parentFolder) addFolderChain(parentFolder);
        if (item.type === "blob") {
            const id = `file:${item.path}`;
            if (!graph.hasNode(id)) graph.addNode(id, seedXY());
            const parentId = parentFolder ? `folder:${parentFolder}` : root;
            if (graph.hasNode(parentId) && !graph.hasEdge(parentId, id)) {
                graph.addEdge(parentId, id);
            }
        } else if (item.type === "tree") {
            addFolderChain(item.path);
        }
    }

    return graph;
}

export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`graph-seed:${ip}`, 30, 60_000);
    if (!rl.ok) {
        return NextResponse.json(
            { error: "Too many requests" },
            {
                status: 429,
                headers: {
                    "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
                },
            },
        );
    }

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    if (!owner || !repo || !OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
        return NextResponse.json({ error: "Invalid owner or repo" }, { status: 400 });
    }

    const token =
        request.headers.get("x-github-token") ??
        process.env.GITHUB_TOKEN ??
        null;

    try {
        const data = await fetchAllRepoData(owner, repo, token);
        const fileTree = data.fileTree;
        if (!fileTree?.tree?.length) {
            return NextResponse.json({ positions: {}, cached: false });
        }

        const cacheKey = `graph-seed:${owner}/${repo}/${fileTree.sha}`;
        const cached = await getCachedSeed(cacheKey);
        if (cached) {
            return NextResponse.json({ positions: cached, cached: true });
        }

        const items = selectImportantTreeItems(fileTree.tree);
        const graph = buildFileTreeSeedGraph(items);
        const nodeCount = graph.order;

        if (nodeCount === 0) {
            return NextResponse.json({ positions: {}, cached: false });
        }

        const iterations = nodeCount > 1500 ? 200 : 400;
        const layout = forceAtlas2(graph, {
            iterations,
            settings: {
                gravity: 1,
                scalingRatio: 2,
                barnesHutOptimize: nodeCount > 500,
                adjustSizes: true,
            },
        });

        const positions: SeedPositions = {};
        for (const [id, pos] of Object.entries(layout)) {
            positions[id] = [pos.x, pos.y];
        }

        // Fire-and-forget — never let a cache write delay the response.
        void setCachedSeed(cacheKey, positions, SEED_TTL_SEC);

        return NextResponse.json({ positions, cached: false });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to compute seed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
