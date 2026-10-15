export function parseRepositoryInput(input: string): { owner: string; repo: string } | null {
    const value = input.trim().replace(/\/$/, "");
    const match = value.match(/^(?:(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitvize\.com)\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([a-zA-Z0-9._-]{1,100})(?:[?#].*)?$/);
    if (!match) return null;
    const repo = match[2].replace(/\.git$/, "");
    if (!repo || repo === "." || repo === "..") return null;
    return { owner: match[1], repo };
}
