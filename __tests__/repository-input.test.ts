import { parseRepositoryInput } from "@/lib/repository-input";

it.each([
    "facebook/react", " https://github.com/facebook/react ",
    "github.com/facebook/react", "https://github.com/facebook/react/",
    "https://github.com/facebook/react.git", "https://github.com/facebook/react?tab=readme",
])("accepts repository input %s", (input) => {
    expect(parseRepositoryInput(input)).toEqual({ owner: "facebook", repo: "react" });
});

it.each(["", "react", "https://other.com/facebook/react", "https://notgithub.com/facebook/react", "owner/..", "owner/.", "owner/repo/extra", "owner/repo name"])("rejects invalid repository input %s", (input) => {
    expect(parseRepositoryInput(input)).toBeNull();
});
