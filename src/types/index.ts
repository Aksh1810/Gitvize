// ============================================================================
// Gitvize — Shared TypeScript Types
// ============================================================================

// --- GitHub API Types ---

export type RepositorySnapshot = {
  schemaVersion: 1;
  owner: string;
  repo: string;
  selectedBranch: string;
  defaultBranch: string;
  visibility: "public" | "private";
  capturedAt: string;
} & ({ status: "ready"; commitSha: string; treeSha: string } | { status: "empty"; commitSha: null; treeSha: null });

export type RepositoryObservations = Record<"metadata" | "contributors" | "languages", { observedAt: string; status: "ready" | "partial" | "error" }>;

export interface SectionError {
  code: "forbidden" | "not_found" | "rate_limited" | "upstream" | "oversized" | "batch_too_large" | "unsupported" | "parse_error" | "limited" | "coverage_unknown";
  message: string;
  status?: number;
  retryAfter?: number;
}
export type SectionResult<T> =
  | { status: "pending" }
  | { status: "ready"; data: T }
  | { status: "partial"; data: T; errors: SectionError[] }
  | { status: "error" | "unsupported"; error: SectionError; errors?: SectionError[] };
export interface DependencyFile { filename: string; content: string }
export interface RepositorySections {
  contributors: SectionResult<Contributor[]>;
  languages: SectionResult<LanguageStats>;
  branches: SectionResult<Branch[]>;
  dependencyFiles: SectionResult<DependencyFile[]>;
  readme: SectionResult<string>;
  mergedPRs: SectionResult<MergedPR[]>;
}
export interface TreeCoverage {
  upstreamTruncated: boolean;
  applicationCapped: boolean;
  enumeratedTreeItems: number;
  enumeratedFiles: number;
  retainedTreeItems: number;
  retainedFiles: number;
  totalTreeItems: number | null;
  totalFiles: number | null;
}
export type FilePathOutcome = { path: string; status: "ready" } | { path: string; status: "error"; error: SectionError };

export interface RepoMetadata {
  visibility?: "public" | "private";
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  license: string | null;
  topics: string[];
  language: string | null;
  pushedAt: string;
  defaultBranch: string;
  htmlUrl: string;
}

export interface TreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

/** Architecture generation needs structure, not GitHub URLs or blob metadata. */
export type AnalysisTreeItem = Pick<TreeItem, "path" | "type">;

export interface FileTreeResponse {
  coverage?: TreeCoverage;
  sha: string;
  tree: TreeItem[];
  truncated: boolean;
}

export interface Contributor {
  login: string;
  id: number;
  avatarUrl: string;
  contributions: number;
  htmlUrl: string;
  email?: string;
  name?: string;
}

export interface Branch {
  /** Captured branch head; separate from the default code snapshot. */
  headSha?: string;
  capturedAt?: string;
  name: string;
  sha: string;
  isDefault: boolean;
}

export interface Commit {
  /** Full 40-char SHA — used for parent matching in the DAG */
  sha: string;
  /** 7-char display SHA */
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  authorLogin: string | null;
  authorAvatar: string | null;
  date: string;
  branch?: string;
  /** Full SHAs of parent commits (empty array for root commit) */
  parents?: string[];
}

export interface CommitHistoryError { status: number; message: string; retryAfter?: number }
export interface CommitHistoryPage {
  status: "ready";
  headSha: string;
  page: number;
  perPage: number;
  commits: Commit[];
  nextPage: number | null;
}
export type HistoryPageResult = CommitHistoryPage | { status: "error"; page: number; perPage: number; error: CommitHistoryError };
export interface BranchHistory {
  branch: string;
  headSha: string | null;
  perPage: number;
  pages: Record<number, HistoryPageResult>;
  nextPage: number | null;
  complete: boolean;
  cutoff: boolean;
  error: CommitHistoryError | null;
}

export interface MergedPR {
  number: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  mergedAt: string;
  authorLogin: string;
  authorAvatar: string | null;
  mergedByLogin: string | null;
  mergedByAvatar: string | null;
  htmlUrl: string;
}

export interface LanguageStats {
  [language: string]: number;
}

// --- AI Analysis Types ---

export interface ModuleAnalysis {
  name: string;
  type: "api" | "ui" | "database" | "config" | "utility" | "test" | "build" | "docs" | "core" | "middleware" | "service" | "model" | "controller" | "view" | "other";
  description: string;
  files: string[];
  dependencies: string[];
  entryPoint?: string;
}

export interface FileNode {
  path: string;
  label: string;
  group: string;
  role: string;
}

export interface FileEdge {
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureAnalysis {
  techStack: string[];
  architecturePattern: string;
  description: string;
  modules: ModuleAnalysis[];
  entryPoints: string[];
  dataFlow: Array<{
    from: string;
    to: string;
    description: string;
  }>;
  fileNodes?: FileNode[];
  fileEdges?: FileEdge[];
  groups?: Array<{
    name: string;
    label: string;
    color: string;
  }>;
  mermaidDiagram?: string;
}

export interface FileAnnotation {
  path: string;
  role: string;
  description: string;
  module: string;
}

export interface AnalysisResult {
  architecture: ArchitectureAnalysis;
  annotations: FileAnnotation[];
  generatedAt: string;
  commitSha: string;
}

export interface RepositoryAnalysisResult {
  architecture: ArchitectureAnalysis;
  annotations: FileAnnotation[];
  source: "smart" | "ai" | "fallback";
  metadataSource: "ai" | "deterministic";
  fallbackReason?: string;
  readmeTruncated?: boolean;
}

/** Provider output is not verified AI output until the browser parser accepts it. */
export type RepositoryAnalysisResponse = Omit<RepositoryAnalysisResult, "source"> & {
  source: "smart" | "pending" | "fallback";
};

// --- Pipeline Types ---

export type PipelineStep = "ingest" | "understand" | "enrich";
export type PipelineStatus = "pending" | "running" | "complete" | "error";

export interface PipelineEvent {
  step: PipelineStep;
  status: PipelineStatus;
  message: string;
  data?: unknown;
  timestamp: string;
}

// --- React Flow Node/Edge Types ---

export interface ModuleNodeData {
  label: string;
  type: ModuleAnalysis["type"];
  description: string;
  fileCount: number;
  files: string[];
  entryPoint?: string;
}

export interface FileNodeData {
  label: string;
  path: string;
  type: "file" | "folder";
  extension?: string;
  size?: number;
  description?: string;
  isExpanded?: boolean;
  childCount?: number;
}

export interface ContributorNodeData {
  login: string;
  avatarUrl: string;
  contributions: number;
  htmlUrl: string;
}

export interface CommitNodeData {
  sha: string;
  message: string;
  authorName: string;
  authorAvatar: string | null;
  date: string;
  branch: string;
}

export interface DependencyNodeData {
  name: string;
  version?: string;
  isDirect: boolean;
  dependentCount: number;
  role?: "project" | "group" | "dependency";
  isSelected?: boolean;
  isDimmed?: boolean;
}

// --- UI Types ---

export type DiagramTab = "architecture" | "files" | "contributors" | "branches" | "dependencies";

export interface ExampleRepo {
  owner: string;
  repo: string;
  description: string;
  stars: string;
  language: string;
}
