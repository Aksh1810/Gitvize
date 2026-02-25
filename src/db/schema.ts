// ============================================================================
// GitViz — Database Schema (Drizzle ORM + PostgreSQL)
// ============================================================================

import {
    pgTable,
    text,
    integer,
    timestamp,
    jsonb,
    serial,
    uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Repositories Table ---
// Caches repo metadata to avoid re-fetching on every visit

export const repositories = pgTable(
    "repositories",
    {
        id: serial("id").primaryKey(),
        owner: text("owner").notNull(),
        repo: text("repo").notNull(),
        fullName: text("full_name").notNull(),
        description: text("description"),
        stars: integer("stars").default(0),
        forks: integer("forks").default(0),
        watchers: integer("watchers").default(0),
        openIssues: integer("open_issues").default(0),
        license: text("license"),
        language: text("language"),
        topics: jsonb("topics").$type<string[]>().default([]),
        defaultBranch: text("default_branch").default("main"),
        latestSha: text("latest_sha"),
        pushedAt: text("pushed_at"),
        htmlUrl: text("html_url"),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
    },
    (table) => [
        uniqueIndex("owner_repo_idx").on(table.owner, table.repo),
    ]
);

// --- Analyses Table ---
// Stores AI analysis results keyed by owner/repo/sha

export const analyses = pgTable(
    "analyses",
    {
        id: serial("id").primaryKey(),
        owner: text("owner").notNull(),
        repo: text("repo").notNull(),
        commitSha: text("commit_sha").notNull(),
        architecture: jsonb("architecture"),
        annotations: jsonb("annotations"),
        fileTree: jsonb("file_tree"),
        contributors: jsonb("contributors"),
        branches: jsonb("branches"),
        commits: jsonb("commits"),
        languages: jsonb("languages"),
        dependencies: jsonb("dependencies"),
        generatedAt: timestamp("generated_at").defaultNow(),
    },
    (table) => [
        uniqueIndex("analysis_cache_idx").on(
            table.owner,
            table.repo,
            table.commitSha
        ),
    ]
);

// --- Pipeline Logs Table ---
// Records pipeline execution status and errors

export const pipelineLogs = pgTable("pipeline_logs", {
    id: serial("id").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    step: text("step").notNull(), // ingest | understand | enrich
    status: text("status").notNull(), // pending | running | complete | error
    message: text("message"),
    errorDetails: text("error_details"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Type exports ---
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type PipelineLog = typeof pipelineLogs.$inferSelect;
export type NewPipelineLog = typeof pipelineLogs.$inferInsert;
