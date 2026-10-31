import { z } from "zod";
import type { RepositorySnapshot } from "@/types";

export const REPOSITORY_SNAPSHOT_VERSION = 1;
export const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const base = z.object({
    schemaVersion: z.literal(REPOSITORY_SNAPSHOT_VERSION),
    owner: z.string().regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/),
    repo: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
    selectedBranch: z.string().min(1).max(1024),
    defaultBranch: z.string().min(1).max(1024),
    visibility: z.enum(["public", "private"]),
    capturedAt: z.string().datetime({ offset: true }),
});
export const repositorySnapshotSchema: z.ZodType<RepositorySnapshot> = z.discriminatedUnion("status", [
    base.extend({ status: z.literal("ready"), commitSha: gitShaSchema, treeSha: gitShaSchema }).strict(),
    base.extend({ status: z.literal("empty"), commitSha: z.null(), treeSha: z.null() }).strict(),
]).refine(snapshot => snapshot.selectedBranch === snapshot.defaultBranch);

export class RepositorySnapshotError extends Error {
    constructor() { super("Invalid or mismatched repository snapshot."); }
}

export function parseRepositorySnapshot(value: unknown, owner?: string, repo?: string): RepositorySnapshot {
    const parsed = repositorySnapshotSchema.safeParse(value);
    if (!parsed.success || (owner && parsed.data.owner.toLowerCase() !== owner.toLowerCase()) || (repo && parsed.data.repo.toLowerCase() !== repo.toLowerCase())) throw new RepositorySnapshotError();
    return parsed.data;
}

/** Capture time is descriptive; revision, branch and schema define ownership. */
export function repositorySnapshotKey(snapshot?: RepositorySnapshot): string | undefined {
    if (!snapshot) return undefined;
    return JSON.stringify([snapshot.schemaVersion, snapshot.owner.toLowerCase(), snapshot.repo.toLowerCase(), snapshot.selectedBranch, snapshot.defaultBranch, snapshot.visibility, snapshot.status, snapshot.commitSha, snapshot.treeSha]);
}
