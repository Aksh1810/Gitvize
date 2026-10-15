"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Boxes, GitBranch, Github, Loader2, Network, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/ui/brand-logo";
import GitHubTokenModal, { setOneTimeGitHubToken } from "@/components/dashboard/github-token-modal";
import RepositoryPreview from "@/components/dashboard/repository-preview";
import ThemeToggle from "@/components/ui/theme-toggle";
import { EXAMPLE_REPOS } from "@/lib/constants";
import { parseRepositoryInput } from "@/lib/repository-input";

const FEATURES = [
  { icon: Network, title: "Follow the connections.", description: "Explore files as a connected map. Trace imports, find the hubs, and see where a change could reach.", tag: "File explorer" },
  { icon: Boxes, title: "Start with the big picture.", description: "See the modules behind the code. Get an automatic architecture overview, with optional AI analysis for more context.", tag: "Architecture" },
  { icon: GitBranch, title: "Understand the backstory.", description: "Explore branches, commit history, contributors, and dependencies without losing your place.", tag: "Repository insights" },
];

export default function LandingPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [githubTokenOpen, setGithubTokenOpen] = useState(false);
  const [pendingRepo, setPendingRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [accessHint, setAccessHint] = useState<string | null>(null);

  async function checkAccess(owner: string, repo: string, token?: string) {
    return fetch(`/api/github/repo/access?${new URLSearchParams({ owner, repo })}`, {
      headers: token ? { "x-github-token": token } : undefined,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isNavigating) return;
    const parsed = parseRepositoryInput(input);
    if (!parsed) {
      setAccessHint("Enter a GitHub repository URL or owner/repo, such as facebook/react.");
      return;
    }
    setIsNavigating(true);
    setAccessHint(null);
    try {
      const response = await checkAccess(parsed.owner, parsed.repo);
      if (response.ok) {
        router.push(`/${parsed.owner}/${parsed.repo}`);
        return;
      }
      if ([401, 403, 404].includes(response.status)) {
        setPendingRepo(parsed);
        setGithubTokenOpen(true);
        setAccessHint("Repository not found or access restricted. Check the name, or add a token for a private repository.");
      } else {
        setAccessHint(response.status === 429 ? "Too many requests. Please wait a minute and try again." : "GitHub is unavailable right now. Please try again shortly.");
      }
    } catch {
      setAccessHint("Could not connect. Check your connection and try again.");
    }
    setIsNavigating(false);
  }

  return (
    <div className="atlas-landing landing-scroll-shell">
      <a href="#repo-input" className="skip-link">Skip to repository input</a>
      <header className="atlas-header">
        <Link href="/" className="atlas-brand" aria-label="Gitvize home"><BrandLogo size={32} /><span>gitvize<span className="brand-period">.</span></span></Link>
        <nav aria-label="Main navigation" className="atlas-links">
          <a href="#explore">Explore</a><a href="#how-it-works">How it works</a>
        </nav>
        <div className="atlas-header-actions"><ThemeToggle /><a className="atlas-github" aria-label="Gitvize on GitHub" href="https://github.com/Aksh1810/Gitvize" target="_blank" rel="noopener noreferrer"><Github size={16} /><span>GitHub</span><ArrowUpRight size={14} /></a></div>
      </header>
      <main>
        <section className="atlas-hero" aria-labelledby="hero-title">
          <div className="atlas-eyebrow"><span /> YOUR CODEBASE, CONNECTED</div>
          <h1 id="hero-title">Less digging.<br /><span>More understanding.</span></h1>
          <p className="atlas-intro">Every repository has a story. See how the files, people,<br className="hidden sm:block" /> and ideas fit together — in one interactive workspace.</p>
          <div id="repository" className="atlas-repo-entry">
            <label htmlFor="repo-input">Start with a GitHub repository</label>
            <form onSubmit={handleSubmit} className="atlas-repo-form" aria-busy={isNavigating}>
              <Github size={21} aria-hidden="true" />
              <Input id="repo-input" value={input} onChange={(event) => { setInput(event.target.value); setAccessHint(null); }} placeholder="github.com/owner/repository" aria-invalid={!!accessHint} aria-describedby={accessHint ? "repo-error" : "repo-help"} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={isNavigating} />
              <Button type="submit" disabled={isNavigating} className="atlas-primary">{isNavigating ? <Loader2 size={16} className="animate-spin" /> : null}{isNavigating ? "Opening…" : "Explore repo"}{!isNavigating && <ArrowRight size={16} />}</Button>
            </form>
            {accessHint ? <p id="repo-error" role="alert" className="atlas-error">{accessHint}</p> : <p id="repo-help" className="atlas-input-help"><ShieldCheck size={13} /> Public repos need no token. Private repos are welcome, too.</p>}
          </div>
          <div className="atlas-quick-start"><span>Or take a look inside</span>{EXAMPLE_REPOS.slice(0, 3).map((example) => <Link key={example.repo} href={`/${example.owner}/${example.repo}`}>{example.repo}<ArrowUpRight size={12} /></Link>)}</div>
        </section>

        <section className="atlas-preview-section" aria-label="Interactive product preview">
          <div className="atlas-section-caption"><span><span className="status-dot" /> A DIFFERENT WAY TO READ CODE</span><span>Interactive preview ↓</span></div>
          <RepositoryPreview />
          <div className="atlas-preview-caption"><span>From the first file to the full picture.</span><span>Five views. One repository.</span></div>
        </section>

        <section id="explore" className="atlas-features">
          <div className="atlas-section-heading"><p className="atlas-kicker">BUILT FOR THE MOMENT YOU ASK</p><h2>“Where do I even start?”</h2><p>A new project, a tricky review, or a repo you&apos;re curious about.<br />Get your bearings before you get into the details.</p></div>
          <div className="atlas-feature-grid">{FEATURES.map(({ icon: Icon, title, description, tag }) => <article key={title} className="atlas-feature"><div className="atlas-feature-icon"><Icon size={24} /></div><span className="atlas-kicker">{tag}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
        </section>

        <section className="atlas-examples" aria-labelledby="examples-title"><div className="atlas-examples-heading"><div><p className="atlas-kicker">OPEN SOURCE, OPEN TO EXPLORE</p><h2 id="examples-title">Pick a starting point.</h2></div><span>No setup required <ArrowUpRight size={16} /></span></div><div className="atlas-example-grid">{EXAMPLE_REPOS.slice(0, 4).map((example) => <Link href={`/${example.owner}/${example.repo}`} key={example.repo} className="atlas-example"><div><Github size={21} /><ArrowUpRight size={18} /></div><h3>{example.repo}</h3><p>{example.description}</p><span>{example.owner}<span className="atlas-language">{example.language}</span></span></Link>)}</div></section>

        <section id="how-it-works" className="atlas-how"><div><p className="atlas-kicker">FROM URL TO UNDERSTANDING</p><h2>Your next rabbit hole.<br />With a map.</h2><a href="#repository" className="atlas-text-link">Explore a repository <ArrowRight size={18} /></a></div><ol>{[{ title: "Drop in a repository", text: "Paste a GitHub URL or owner/repo. Add a token only when access requires it." }, { title: "Let the map take shape", text: "Gitvize loads the files, history, and relationships. Larger repositories can take a little longer." }, { title: "Follow your curiosity", text: "Search for a file, inspect its code, or switch views to understand the architecture and people behind it." }].map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol></section>
      </main>
      <footer className="atlas-footer"><Link href="/" className="atlas-brand"><BrandLogo size={25} /><span>gitvize.</span></Link><span>Made for curious developers.</span><a href="https://github.com/Aksh1810/Gitvize" target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={14} /></a></footer>
      <GitHubTokenModal open={githubTokenOpen} onOpenChange={setGithubTokenOpen} onSave={async (token) => {
        if (!pendingRepo) throw new Error("Choose a repository first.");
        const response = await checkAccess(pendingRepo.owner, pendingRepo.repo, token);
        if (!response.ok) throw new Error("Could not access this repository. Check its name and your token permissions, then try again.");
        setOneTimeGitHubToken(token);
        setAccessHint(null);
        router.push(`/${pendingRepo.owner}/${pendingRepo.repo}`);
      }} />
    </div>
  );
}
