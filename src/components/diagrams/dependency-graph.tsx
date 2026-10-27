"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Package,
    Search,
    X,
    ArrowUpDown,
    ExternalLink,
    BookOpen,
    Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParsedDependency } from "@/lib/dep-parser";

/* ─── Known-package registry (static, no API calls needed) ─── */

interface PackageInfo {
    description: string;
    category: string;
    popular?: boolean;
    homepage?: string;
}

const KNOWN_PACKAGES: Record<string, PackageInfo> = {
    // ── React ecosystem ──
    react:               { description: "A library for building user interfaces with reusable components.", category: "UI", popular: true, homepage: "https://react.dev" },
    "react-dom":         { description: "Renders React components in the browser.", category: "UI", popular: true, homepage: "https://react.dev" },
    next:                { description: "A full-stack React framework with server rendering and routing.", category: "Framework", popular: true, homepage: "https://nextjs.org" },
    "framer-motion":     { description: "Production-ready animations and gestures for React.", category: "Animation", popular: true, homepage: "https://motion.dev" },
    "react-hook-form":   { description: "Performant form handling with easy validation.", category: "Forms", popular: true },
    "react-query":       { description: "Powerful data fetching and caching for React apps.", category: "Data", popular: true },
    "@tanstack/react-query": { description: "Powerful data fetching and caching for React apps.", category: "Data", popular: true },
    "react-router":      { description: "Declarative routing for React applications.", category: "Routing", popular: true },
    "react-router-dom":  { description: "DOM bindings for React Router.", category: "Routing", popular: true },

    // ── Styling & UI ──
    tailwindcss:         { description: "Utility-first CSS framework for rapid UI development.", category: "Styling", popular: true, homepage: "https://tailwindcss.com" },
    "@tailwindcss/postcss": { description: "PostCSS plugin for processing Tailwind CSS.", category: "Styling" },
    "class-variance-authority": { description: "Create type-safe UI component variants.", category: "Styling" },
    clsx:                { description: "Tiny utility for constructing CSS class strings.", category: "Styling", popular: true },
    "tailwind-merge":    { description: "Merge Tailwind classes without style conflicts.", category: "Styling" },
    "lucide-react":      { description: "Beautiful open-source icons as React components.", category: "UI", popular: true, homepage: "https://lucide.dev" },
    "@radix-ui/react-slot": { description: "Composable slot primitive for building UI libraries.", category: "UI" },
    "@radix-ui/react-dialog": { description: "Accessible dialog/modal component.", category: "UI" },
    "@radix-ui/react-dropdown-menu": { description: "Accessible dropdown menu component.", category: "UI" },
    "@radix-ui/react-tooltip": { description: "Accessible tooltip component.", category: "UI" },

    // ── Data visualization ──
    recharts:            { description: "Composable charting library built on React components.", category: "Charts", popular: true, homepage: "https://recharts.org" },
    "@xyflow/react":     { description: "Build interactive node-based diagrams and flowcharts.", category: "Charts", popular: true, homepage: "https://reactflow.dev" },
    mermaid:             { description: "Generate diagrams and flowcharts from text.", category: "Charts", popular: true, homepage: "https://mermaid.js.org" },
    cytoscape:           { description: "Graph theory library for visualizing networks.", category: "Charts", popular: true, homepage: "https://js.cytoscape.org" },
    "cytoscape-fcose":   { description: "Fast compound spring-embedder layout for Cytoscape.", category: "Charts" },
    d3:                  { description: "Powerful data visualization library using web standards.", category: "Charts", popular: true, homepage: "https://d3js.org" },
    "chart.js":          { description: "Simple yet flexible JavaScript charting library.", category: "Charts", popular: true },
    dagre:               { description: "Directed graph layout for clean hierarchical diagrams.", category: "Charts" },

    // ── State management ──
    zustand:             { description: "Small, fast state management for React.", category: "State", popular: true },
    redux:               { description: "Predictable state container for JavaScript apps.", category: "State", popular: true },
    "@reduxjs/toolkit":  { description: "The official, batteries-included toolset for Redux.", category: "State", popular: true },
    jotai:               { description: "Primitive and flexible state management for React.", category: "State" },
    recoil:              { description: "Experimental state management library from Meta.", category: "State" },

    // ── Utilities ──
    lodash:              { description: "Utility library with helpful functions for common tasks.", category: "Utility", popular: true },
    axios:               { description: "Promise-based HTTP client for browsers and Node.js.", category: "Networking", popular: true },
    zod:                 { description: "TypeScript-first schema validation with static type inference.", category: "Validation", popular: true },
    "date-fns":          { description: "Modern JavaScript date utility library.", category: "Utility", popular: true },
    dayjs:               { description: "Tiny and fast date library, a Moment.js alternative.", category: "Utility", popular: true },
    uuid:                { description: "Generate unique identifiers (UUIDs).", category: "Utility", popular: true },
    nanoid:              { description: "Tiny, secure, URL-friendly unique string ID generator.", category: "Utility" },
    "simple-git":        { description: "A lightweight interface for running Git commands in Node.js.", category: "Utility" },

    // ── Build & tooling ──
    typescript:          { description: "Adds static types to JavaScript for safer, clearer code.", category: "Build", popular: true, homepage: "https://typescriptlang.org" },
    eslint:              { description: "Find and fix problems in your JavaScript/TypeScript code.", category: "Build", popular: true, homepage: "https://eslint.org" },
    prettier:            { description: "Opinionated code formatter for consistent style.", category: "Build", popular: true, homepage: "https://prettier.io" },
    webpack:             { description: "Module bundler for modern JavaScript applications.", category: "Build", popular: true },
    vite:                { description: "Next-generation frontend build tool, blazing fast.", category: "Build", popular: true, homepage: "https://vitejs.dev" },
    turbopack:           { description: "Incremental bundler optimized for Next.js.", category: "Build" },
    postcss:             { description: "Tool for transforming CSS with JavaScript plugins.", category: "Build", popular: true },
    "@eslint/eslintrc":  { description: "ESLint configuration file compatibility utilities.", category: "Build" },
    "eslint-config-next":{ description: "ESLint configuration used by Next.js projects.", category: "Build" },
    "@next/eslint-plugin-next": { description: "ESLint plugin with Next.js-specific rules.", category: "Build" },

    // ── Testing ──
    jest:                { description: "Delightful JavaScript testing framework.", category: "Testing", popular: true, homepage: "https://jestjs.io" },
    vitest:              { description: "Blazing fast unit testing powered by Vite.", category: "Testing", popular: true },
    "@testing-library/react": { description: "Simple and complete React DOM testing utilities.", category: "Testing", popular: true },
    cypress:             { description: "End-to-end testing framework for web applications.", category: "Testing", popular: true },
    playwright:          { description: "Reliable end-to-end testing for modern web apps.", category: "Testing", popular: true },

    // ── Types ──
    "@types/node":       { description: "TypeScript type definitions for Node.js.", category: "Types" },
    "@types/react":      { description: "TypeScript type definitions for React.", category: "Types" },
    "@types/react-dom":  { description: "TypeScript type definitions for React DOM.", category: "Types" },

    // ── AI / ML ──
    openai:              { description: "Official client library for the OpenAI API.", category: "AI", popular: true },
    "@anthropic-ai/sdk": { description: "Official client library for the Anthropic API.", category: "AI", popular: true },
    langchain:           { description: "Framework for building applications with language models.", category: "AI", popular: true },

    // ── Backend ──
    express:             { description: "Fast, minimalist web framework for Node.js.", category: "Backend", popular: true, homepage: "https://expressjs.com" },
    fastify:             { description: "Fast and low-overhead web framework for Node.js.", category: "Backend", popular: true },
    prisma:              { description: "Next-generation ORM for Node.js and TypeScript.", category: "Database", popular: true, homepage: "https://prisma.io" },
    "@prisma/client":    { description: "Auto-generated query builder for Prisma.", category: "Database", popular: true },
    mongoose:            { description: "Elegant MongoDB object modeling for Node.js.", category: "Database", popular: true },

    // ── Auth ──
    "next-auth":         { description: "Authentication for Next.js applications.", category: "Auth", popular: true },
    jsonwebtoken:        { description: "Create and verify JSON Web Tokens (JWT).", category: "Auth", popular: true },
    bcrypt:              { description: "Library to hash and check passwords securely.", category: "Auth" },

};

const OTHER_PACKAGES: Record<"pypi" | "go" | "cargo", Record<string, PackageInfo>> = {
    pypi: {
        flask: { description: "Lightweight Python web framework.", category: "Backend" },
        django: { description: "High-level Python web framework for rapid development.", category: "Backend" },
        fastapi: { description: "Modern, fast Python web framework for building APIs.", category: "Backend" },
        numpy: { description: "Fundamental package for scientific computing with Python.", category: "Data Science" },
        pandas: { description: "Data analysis and manipulation library for Python.", category: "Data Science" },
        requests: { description: "Simple HTTP library for Python.", category: "Networking" },
        pytest: { description: "Simple and powerful testing framework for Python.", category: "Testing" },
        black: { description: "The uncompromising Python code formatter.", category: "Build" },
    },
    go: {
        "github.com/gin-gonic/gin": { description: "Fast HTTP web framework for Go.", category: "Backend" },
    },
    cargo: {
        serde: { description: "Serialization framework for Rust.", category: "Utility" },
        tokio: { description: "Asynchronous runtime for Rust.", category: "Runtime" },
    },
};

const CATEGORY_COLORS: Record<string, string> = {
    UI: "#6366f1",
    Framework: "#8b5cf6",
    Styling: "#ec4899",
    Animation: "#f472b6",
    Charts: "#06b6d4",
    State: "#14b8a6",
    Utility: "#64748b",
    Build: "#f59e0b",
    Testing: "#22c55e",
    Types: "#94a3b8",
    Networking: "#3b82f6",
    Validation: "#10b981",
    Database: "#f97316",
    Auth: "#ef4444",
    AI: "#a78bfa",
    Backend: "#0ea5e9",
    "Data Science": "#8b5cf6",
    Runtime: "#f59e0b",
    Routing: "#6366f1",
    Forms: "#14b8a6",
    Data: "#06b6d4",
    Other: "#475569",
};

export function getPackageInfo(name: string, ecosystem: ParsedDependency["ecosystem"]): PackageInfo {
    if (ecosystem && ecosystem !== "npm") {
        return OTHER_PACKAGES[ecosystem][name] ?? { description: "", category: "Other" };
    }
    // Direct lookup
    if (KNOWN_PACKAGES[name]) return KNOWN_PACKAGES[name];

    // Scoped package matching (e.g. @radix-ui/react-*)
    if (name.startsWith("@radix-ui/"))   return { description: "Accessible, unstyled UI primitives for React.", category: "UI" };
    if (name.startsWith("@types/"))      return { description: `TypeScript type definitions for ${name.replace("@types/", "")}.`, category: "Types" };
    if (name.startsWith("eslint"))       return { description: "ESLint plugin or configuration package.", category: "Build" };
    if (name.startsWith("@next/"))       return { description: "Official Next.js package.", category: "Framework" };
    if (name.startsWith("@tanstack/"))   return { description: "High-quality, headless utilities for the web.", category: "Data" };

    return { description: "A package used by this project.", category: "Other" };
}

function getPackageUrl(dep: ParsedDependency): string {
    switch (dep.ecosystem) {
        case "pypi": return `https://pypi.org/project/${encodeURIComponent(dep.name)}/`;
        case "go": return `https://pkg.go.dev/${encodeURI(dep.name)}`;
        case "cargo": return `https://crates.io/crates/${encodeURIComponent(dep.name)}`;
        default: return `https://www.npmjs.com/package/${dep.name}`;
    }
}

/* ─── npm download count fetcher ─── */

interface NpmMeta {
    downloads: number | null;
    description: string | null;
    homepage: string | null;
}

// Module-level cache so npm metadata survives re-renders and tab switches.
const npmMetaCache = new Map<string, NpmMeta>();

function useNpmMeta(dependencies: ParsedDependency[]): Map<string, NpmMeta> {
    // Stable key: only the sorted package names, not the full array reference.
    const packageKey = useMemo(
        () => dependencies.map((d) => d.name).sort().join(","),
        [dependencies]
    );

    const [meta, setMeta] = useState<Map<string, NpmMeta>>(() => {
        // Initialise from cache so first render already has data from prior visits.
        const cached = new Map<string, NpmMeta>();
        for (const dep of dependencies) {
            const hit = npmMetaCache.get(dep.name);
            if (hit) cached.set(dep.name, hit);
        }
        return cached;
    });

    useEffect(() => {
        const uncached = dependencies
            .slice(0, 20)
            .filter((d) => !npmMetaCache.has(d.name));

        if (uncached.length === 0) return;

        let cancelled = false;

        async function fetchMeta() {
            const batchSize = 8;
            for (let i = 0; i < uncached.length; i += batchSize) {
                if (cancelled) return;
                const batch = uncached.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(async (dep) => {
                        try {
                            const encodedName = dep.name.startsWith("@")
                                ? `@${encodeURIComponent(dep.name.slice(1))}`
                                : encodeURIComponent(dep.name);

                            const [pointRes, regRes] = await Promise.all([
                                fetch(`https://api.npmjs.org/downloads/point/last-week/${encodedName}`).then(r => r.ok ? r.json() : null).catch(() => null),
                                fetch(`https://registry.npmjs.org/${encodedName}`, { headers: { Accept: "application/vnd.npm.install-v1+json" } }).then(r => r.ok ? r.json() : null).catch(() => null),
                            ]);

                            const result: NpmMeta = {
                                downloads: pointRes?.downloads ?? null,
                                description: regRes?.description ?? null,
                                homepage: regRes?.homepage ?? null,
                            };
                            npmMetaCache.set(dep.name, result);
                        } catch {
                            npmMetaCache.set(dep.name, { downloads: null, description: null, homepage: null });
                        }
                    })
                );

                if (!cancelled) {
                    // Snapshot the full cache for all known deps after each batch.
                    const snapshot = new Map<string, NpmMeta>();
                    for (const dep of dependencies.slice(0, 20)) {
                        const hit = npmMetaCache.get(dep.name);
                        if (hit) snapshot.set(dep.name, hit);
                    }
                    setMeta(snapshot);
                }
            }
        }

        fetchMeta();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [packageKey]);

    return meta;
}

function formatDownloads(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
}

/* ─── Component ─── */

interface DependencyGraphProps {
    dependencies: ParsedDependency[];
}

export default function DependencyGraph({
    dependencies,
}: DependencyGraphProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "category" | "type">("type");

    const npmDependencies = useMemo(() => dependencies.filter((dep) => dep.ecosystem === "npm"), [dependencies]);
    const npmMeta = useNpmMeta(npmDependencies);

    const enriched = useMemo(() => {
        return dependencies.map((dep) => {
            const known = getPackageInfo(dep.name, dep.ecosystem);
            const npm = dep.ecosystem === "npm" ? npmMeta.get(dep.name) : undefined;
            return {
                ...dep,
                description: npm?.description || known.description,
                category: known.category,
                homepage: known.homepage || npm?.homepage || null,
                downloads: npm?.downloads ?? null,
            };
        });
    }, [dependencies, npmMeta]);

    const filtered = useMemo(() => {
        let result = [...enriched];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (d) =>
                    d.name.toLowerCase().includes(q) ||
                    d.description.toLowerCase().includes(q) ||
                    d.category.toLowerCase().includes(q)
            );
        }

        if (sortBy === "name") {
            result.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "category") {
            result.sort(
                (a, b) =>
                    a.category.localeCompare(b.category) ||
                    a.name.localeCompare(b.name)
            );
        } else {
            // "type" — direct first, then dev, stable by name within each group
            result.sort(
                (a, b) =>
                    (a.isDirect === b.isDirect ? 0 : a.isDirect ? -1 : 1) ||
                    a.name.localeCompare(b.name)
            );
        }

        return result;
    }, [enriched, searchQuery, sortBy]);

    const directCount = dependencies.filter((d) => d.isDirect).length;
    const devCount = dependencies.filter((d) => !d.isDirect).length;

    if (dependencies.length === 0) {
        return (
            <div className="atlas-list-view atlas-list-state" role="status">
                <div className="text-center">
                    <div className="text-4xl mb-4">📦</div>
                    <p className="text-sm text-muted-foreground">No dependency data found.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        This repo may not have a recognized manifest file (package.json, requirements.txt, etc.)
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="atlas-list-view">
            <div className="atlas-list-toolbar">
                <div className="atlas-list-title">
                    <Package className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-semibold">Packages</span>
                    <Badge variant="secondary" className="text-xs">{dependencies.length}</Badge>
                </div>
                <div className="relative flex items-center">
                    <ArrowUpDown className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <select aria-label="Sort dependencies" value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "category" | "type")} className="atlas-list-sort">
                        <option value="type">By type</option>
                        <option value="name">Name A-Z</option>
                        <option value="category">Category</option>
                    </select>
                </div>
                <div className="atlas-list-search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <Input type="text" placeholder="Search packages..." aria-label="Search dependencies" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-10" />
                    {searchQuery && (
                        <Button variant="ghost" size="icon" aria-label="Clear dependency search" onClick={() => setSearchQuery("")} className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="atlas-list-scroll custom-scrollbar">
                <div className="atlas-list-body">
                    <p className="atlas-list-summary">{directCount} direct · {devCount} development dependencies</p>
                    <div className="atlas-package-list">
                        {filtered.map((dep) => {
                            const catColor = CATEGORY_COLORS[dep.category] ?? CATEGORY_COLORS.Other;

                            return (
                                <motion.div key={`${dep.ecosystem}:${dep.name}`} className="atlas-package">
                                    <div className="min-w-0">
                                        <div className="flex items-start gap-2">
                                            <Package className="w-4 h-4 shrink-0 mt-0.5" style={{ color: catColor }} aria-hidden="true" />
                                            <span className="atlas-package-name text-sm font-semibold text-foreground">{dep.name}</span>
                                        </div>
                                        {dep.description !== "A package used by this project." && (
                                            <p className="atlas-package-description text-sm text-muted-foreground mt-1">{dep.description}</p>
                                        )}
                                    </div>
                                    <div className="atlas-package-meta">
                                        <span className="inline-flex items-center gap-1.5">
                                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} aria-hidden="true" />
                                            {dep.category}
                                        </span>
                                        {dep.version && dep.version !== "*" && (
                                            <span className="atlas-package-version font-mono">v{dep.version.replace(/^[\^~>=<]/, "")}</span>
                                        )}
                                        <Badge variant="secondary" className="text-xs rounded">{dep.isDirect ? "direct" : "dev"}</Badge>
                                        {dep.downloads != null && (
                                            <span className="inline-flex items-center gap-1">
                                                <Download className="w-3 h-3" aria-hidden="true" />
                                                {formatDownloads(dep.downloads)}/wk
                                            </span>
                                        )}
                                    </div>
                                    <div className="atlas-package-actions">
                                        <Button asChild variant="ghost" size="sm">
                                            <a href={getPackageUrl(dep)} target="_blank" rel="noopener noreferrer" aria-label={`View ${dep.name} on ${dep.ecosystem === "pypi" ? "PyPI" : dep.ecosystem === "go" ? "Go docs" : dep.ecosystem === "cargo" ? "crates.io" : "npm"}`}>
                                                <BookOpen className="w-3.5 h-3.5" />
                                                {dep.ecosystem === "pypi" ? "PyPI" : dep.ecosystem === "go" ? "Go docs" : dep.ecosystem === "cargo" ? "crates.io" : "npm"}
                                            </a>
                                        </Button>
                                        {dep.homepage && (
                                            <Button asChild variant="ghost" size="sm">
                                                <a href={dep.homepage} target="_blank" rel="noopener noreferrer" aria-label={`Homepage for ${dep.name}`}>
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    Homepage
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="atlas-list-state text-sm text-muted-foreground" role="status">No packages match your search.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
