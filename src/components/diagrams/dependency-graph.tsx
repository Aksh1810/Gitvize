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
    Star,
    Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

    // ── Python common ──
    flask:               { description: "Lightweight Python web framework.", category: "Backend", popular: true },
    django:              { description: "High-level Python web framework for rapid development.", category: "Backend", popular: true },
    fastapi:             { description: "Modern, fast Python web framework for building APIs.", category: "Backend", popular: true },
    numpy:               { description: "Fundamental package for scientific computing with Python.", category: "Data Science", popular: true },
    pandas:              { description: "Data analysis and manipulation library for Python.", category: "Data Science", popular: true },
    requests:            { description: "Simple HTTP library for Python.", category: "Networking", popular: true },
    pytest:              { description: "Simple and powerful testing framework for Python.", category: "Testing", popular: true },
    black:               { description: "The uncompromising Python code formatter.", category: "Build", popular: true },

    // ── Go common ──
    gin:                 { description: "Fast HTTP web framework for Go.", category: "Backend", popular: true },

    // ── Rust common ──
    serde:               { description: "Serialization framework for Rust.", category: "Utility", popular: true },
    tokio:               { description: "Asynchronous runtime for Rust.", category: "Runtime", popular: true },
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

function getPackageInfo(name: string): PackageInfo {
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

function getNpmUrl(name: string): string {
    return `https://www.npmjs.com/package/${name}`;
}

/* ─── npm download count fetcher ─── */

interface NpmMeta {
    downloads: number | null;
    description: string | null;
    homepage: string | null;
}

function useNpmMeta(dependencies: ParsedDependency[]): Map<string, NpmMeta> {
    const [meta, setMeta] = useState<Map<string, NpmMeta>>(new Map());

    useEffect(() => {
        if (dependencies.length === 0) return;

        let cancelled = false;

        async function fetchMeta() {
            const results = new Map<string, NpmMeta>();

            // Fetch in batches of 8 to avoid hammering the API
            const batchSize = 8;
            for (let i = 0; i < dependencies.length; i += batchSize) {
                if (cancelled) return;
                const batch = dependencies.slice(i, i + batchSize);

                const promises = batch.map(async (dep) => {
                    try {
                        const encodedName = dep.name.startsWith("@")
                            ? `@${encodeURIComponent(dep.name.slice(1))}`
                            : encodeURIComponent(dep.name);

                        const [pointRes, regRes] = await Promise.all([
                            fetch(`https://api.npmjs.org/downloads/point/last-week/${encodedName}`).then(r => r.ok ? r.json() : null).catch(() => null),
                            fetch(`https://registry.npmjs.org/${encodedName}`, { headers: { Accept: "application/vnd.npm.install-v1+json" } }).then(r => r.ok ? r.json() : null).catch(() => null),
                        ]);

                        results.set(dep.name, {
                            downloads: pointRes?.downloads ?? null,
                            description: regRes?.description ?? null,
                            homepage: regRes?.homepage ?? null,
                        });
                    } catch {
                        results.set(dep.name, { downloads: null, description: null, homepage: null });
                    }
                });

                await Promise.all(promises);

                if (!cancelled) {
                    setMeta(new Map(results));
                }
            }
        }

        fetchMeta();
        return () => { cancelled = true; };
    }, [dependencies]);

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
    projectName: string;
}

export default function DependencyGraph({
    dependencies,
    projectName,
}: DependencyGraphProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "category" | "type">("type");

    const npmMeta = useNpmMeta(dependencies);

    const enriched = useMemo(() => {
        return dependencies.map((dep) => {
            const known = getPackageInfo(dep.name);
            const npm = npmMeta.get(dep.name);
            return {
                ...dep,
                description: npm?.description || known.description,
                category: known.category,
                popular: known.popular || (npm?.downloads != null && npm.downloads > 500_000),
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
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-4xl mb-4">📦</div>
                    <p className="text-sm text-gray-400">
                        No dependency data found.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        This repo may not have a recognized manifest file (package.json, requirements.txt, etc.)
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/20">
                <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold">Dependencies</span>
                    <Badge variant="secondary" className="text-[10px]">{dependencies.length}</Badge>
                    {directCount > 0 && (
                        <span className="text-[10px] text-indigo-400/70">{directCount} direct</span>
                    )}
                    {devCount > 0 && (
                        <span className="text-[10px] text-purple-400/70">{devCount} dev</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                        <ArrowUpDown className="absolute left-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as "name" | "category" | "type")}
                            className="h-8 pl-7 pr-3 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors appearance-none cursor-pointer text-foreground"
                        >
                            <option value="type">By type</option>
                            <option value="name">Name A-Z</option>
                            <option value="category">Category</option>
                        </select>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search packages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 w-[180px] pl-8 pr-8 text-xs rounded-lg bg-secondary/50 border border-border/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <div className="max-w-5xl mx-auto px-6 py-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filtered.map((dep, idx) => {
                            const catColor = CATEGORY_COLORS[dep.category] ?? CATEGORY_COLORS.Other;

                            return (
                                <motion.div
                                    key={dep.name}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                                    className="group rounded-xl border border-border/20 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.06] hover:border-border/30 transition-all p-4 flex flex-col gap-3"
                                >
                                    {/* Top row: name + badges */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Package className="w-4 h-4 shrink-0" style={{ color: catColor }} />
                                            <span className="text-sm font-semibold truncate text-foreground group-hover:text-white transition-colors">
                                                {dep.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span
                                                className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                                                style={{
                                                    color: catColor,
                                                    borderColor: `${catColor}40`,
                                                    backgroundColor: `${catColor}15`,
                                                }}
                                            >
                                                {dep.category}
                                            </span>
                                            {dep.popular && (
                                                <span className="flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
                                                    <Star className="w-2.5 h-2.5" />
                                                    Popular
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {dep.description}
                                    </p>

                                    {/* Bottom row: version, type, downloads, links */}
                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/10">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {dep.version && dep.version !== "*" && (
                                                <span className="text-[10px] font-mono text-muted-foreground/80 bg-secondary/40 px-1.5 py-0.5 rounded">
                                                    v{dep.version.replace(/^[\^~>=<]/, "")}
                                                </span>
                                            )}
                                            <span
                                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                    dep.isDirect
                                                        ? "bg-indigo-500/10 text-indigo-400"
                                                        : "bg-purple-500/10 text-purple-400"
                                                }`}
                                            >
                                                {dep.isDirect ? "direct" : "dev"}
                                            </span>
                                            {dep.downloads != null && (
                                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                                                    <Download className="w-2.5 h-2.5" />
                                                    {formatDownloads(dep.downloads)}/wk
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <a
                                                href={getNpmUrl(dep.name)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-indigo-400 transition-colors"
                                            >
                                                <BookOpen className="w-3 h-3" />
                                                Learn more
                                            </a>
                                            {dep.homepage && (
                                                <a
                                                    href={dep.homepage}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-indigo-400 transition-colors"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Homepage
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                            No packages match your search.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
