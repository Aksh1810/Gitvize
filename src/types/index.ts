// ============================================================================
// GitViz — Shared TypeScript Types
// ============================================================================

// --- GitHub API Types ---

export interface RepoMetadata {
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

export interface FileTreeResponse {
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
}

export interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

export interface Commit {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatar: string | null;
  date: string;
  branch?: string;
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
}

// --- UI Types ---

export type DiagramTab = "architecture" | "graph" | "files" | "contributors" | "branches" | "dependencies";

export interface ExampleRepo {
  owner: string;
  repo: string;
  description: string;
  stars: string;
  language: string;
}
