"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Link as LinkIcon,
  Brain,
  LayoutDashboard,
  ExternalLink,
  Users,
  GitPullRequest,
  Search,
  Network,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GitHubTokenModal, { setOneTimeGitHubToken } from "@/components/dashboard/github-token-modal";
import { EXAMPLE_REPOS, HOW_IT_WORKS_STEPS } from "@/lib/constants";
import { fadeSlideUp, staggerContainer, transitions } from "@/lib/motion";

const iconMap: Record<string, React.ReactNode> = {
  Link: <LinkIcon className="w-6 h-6" />,
  Brain: <Brain className="w-6 h-6" />,
  LayoutDashboard: <LayoutDashboard className="w-6 h-6" />,
};

const USE_CASES = [
  {
    icon: <Users className="w-6 h-6" />,
    iconBg: "bg-cyan-400/10 text-cyan-400",
    title: "Joining a new codebase",
    description:
      "Starting at a new job or contributing to open source? See the entire architecture in seconds instead of spending hours reading file trees.",
  },
  {
    icon: <GitPullRequest className="w-6 h-6" />,
    iconBg: "bg-indigo/10 text-indigo",
    title: "Code review",
    description:
      "Understand what a PR actually touches and how those files connect to the rest of the codebase before reviewing a single line.",
  },
  {
    icon: <Search className="w-6 h-6" />,
    iconBg: "bg-amber-400/10 text-amber-400",
    title: "Finding the right file",
    description:
      "Navigate large repos by seeing which files are most connected. Hub nodes are the ones that matter most.",
  },
  {
    icon: <Network className="w-6 h-6" />,
    iconBg: "bg-pink-400/10 text-pink-400",
    title: "Understanding dependencies",
    description:
      "See exactly which files import which, where circular dependencies exist, and which modules are most coupled.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [githubTokenOpen, setGithubTokenOpen] = useState(false);
  const [pendingRepo, setPendingRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [accessHint, setAccessHint] = useState<string | null>(null);

  const checkAccess = useCallback(async (owner: string, repo: string, token?: string) => {
    const params = new URLSearchParams({ owner, repo });
    const res = await fetch(`/api/github/repo/access?${params}`, {
      headers: token ? { "x-github-token": token } : undefined,
    });
    return res;
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = input.trim();
      if (!value) return;

      let owner = "";
      let repo = "";

      // Parse GitHub URL or owner/repo slug
      const urlMatch = value.match(
        /(?:github\.com|gitvize\.com)\/([^/]+)\/([^/\s?#]+)/
      );
      if (urlMatch) {
        owner = urlMatch[1];
        repo = urlMatch[2];
      } else {
        const slugMatch = value.match(/^([^/\s]+)\/([^/\s]+)$/);
        if (slugMatch) {
          owner = slugMatch[1];
          repo = slugMatch[2];
        }
      }

      if (owner && repo) {
        setIsNavigating(true);
        setAccessHint(null);

        try {
          // First check without token: if public, proceed immediately.
          const publicCheck = await checkAccess(owner, repo);
          if (publicCheck.ok) {
            router.push(`/${owner}/${repo}`);
            return;
          }

          setPendingRepo({ owner, repo });
          setGithubTokenOpen(true);
          setAccessHint("This repository appears private or restricted. Add a GitHub PAT to continue.");
        } catch {
          setAccessHint("Network error while checking repo access. Please try again.");
        } finally {
          setIsNavigating(false);
        }
      } else {
        setAccessHint("Enter a GitHub URL or owner/repo, such as facebook/react.");
      }
    },
    [checkAccess, input, router]
  );

  return (
    <div className="landing-schematic landing-scroll-shell h-screen overflow-y-auto overflow-x-hidden flex flex-col">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0a0e1a]/80 backdrop-blur-xl px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="text-xl font-bold gradient-text">Gitvize</span>
          </div>
          <a
            href="https://github.com/Aksh1810/Gitvize"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/[0.03] text-slate-300 hover:text-white hover:border-white/35 hover:bg-white/[0.08] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            GitHub
          </a>
        </div>
      </nav>

      <div className="landing-graph-overlay" aria-hidden="true" />

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pt-24">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-600/[0.08] rounded-full blur-3xl pointer-events-none" />
        <motion.div
          variants={fadeSlideUp}
          initial="hidden"
          animate="show"
          className="w-full max-w-6xl mx-auto mb-12 hero-glow grid items-center gap-10 lg:grid-cols-[1fr_0.9fr] lg:gap-16"
        >
          <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 ui-eyebrow text-sky-200">A map for unfamiliar code</div>

          <h1 className="text-5xl sm:text-6xl font-semibold tracking-[-0.05em] leading-[1.06] mb-6 text-white">
            See how a repository <span className="text-sky-300">fits together.</span>
          </h1>

          <p className="text-lg text-slate-300 max-w-xl mb-8 leading-relaxed">
            Find the files that matter, trace connections, and inspect code from one workspace. Start with a public GitHub repo or add a token for a private one.
          </p>

          {/* Input */}
          <label htmlFor="repo-input" className="mb-2 block text-sm font-medium text-slate-100">GitHub repository</label>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-2 max-w-xl"
          >
            <div className="relative flex-1">
              <Input
                type="text"
                id="repo-input"
                value={input}
                onChange={(e) => { setInput(e.target.value); setAccessHint(null); }}
                placeholder="github.com/owner/repo"
                aria-describedby={accessHint ? "repo-error" : "repo-help"}
                className="h-14 text-base pl-4 pr-4 bg-[#121d30] border-slate-500/60 focus:border-sky-300 focus:ring-2 focus:ring-sky-300/40 rounded-lg"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={isNavigating}
              className="h-14 px-6 text-base rounded-lg border border-sky-200 bg-sky-300 text-slate-950 hover:bg-sky-200 hover:border-sky-200 shadow-lg shadow-black/30 transition-all"
            >
              {isNavigating ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5 mr-2" />
              )}
              Explore repo
            </Button>
          </form>

          <p id="repo-help" className="mt-2 text-sm text-slate-400">Try a URL or a short name such as facebook/react.</p>
          {accessHint && <p id="repo-error" role="alert" className="mt-3 text-sm text-amber-200/90">{accessHint}</p>}
          </div>

          <div className="rounded-2xl border border-sky-300/25 bg-[#111c2d] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.3)]" aria-label="Illustration of a repository file map">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-xs uppercase tracking-[0.15em] text-sky-300">Repository map</p><p className="mt-1 text-sm text-slate-300">Find a path through the code</p></div><span className="rounded-md border border-white/15 px-2 py-1 font-mono text-xs text-slate-300">example/repo</span></div>
            <svg viewBox="0 0 390 320" className="w-full" role="img" aria-label="Folders app and components connected to four source files">
              <path d="M150 91 H183 V64 H214 M183 91 V120 H214 M150 236 H183 V209 H214 M183 236 V265 H214" fill="none" stroke="#44738f" strokeWidth="2" />
              {[[36,73,"app",114],[214,45,"page.tsx",142],[214,101,"api/route.ts",142],[36,218,"components",114],[214,190,"Graph.tsx",142],[214,246,"Search.tsx",142]].map(([x,y,name,width]) => <g key={name}><rect x={x} y={y} width={width} height="38" rx="7" fill={width === 114 ? "#16354a" : "#1b2944"} stroke={width === 114 ? "#64c7df" : "#89a4f9"} strokeOpacity="0.65" /><circle cx={Number(x)+16} cy={Number(y)+19} r="4" fill={width === 114 ? "#64c7df" : "#89a4f9"} /><text x={Number(x)+29} y={Number(y)+24} fill="#edf4fa" fontSize="13" fontFamily="ui-monospace, monospace">{name}</text></g>)}
              <text x="36" y="24" fill="#8ca7ba" fontSize="11" fontFamily="ui-monospace, monospace">FILES / RELATIONSHIPS</text>
              <text x="36" y="310" fill="#8ca7ba" fontSize="11" fontFamily="ui-monospace, monospace">SELECT A FILE → INSPECT ITS CODE</text>
            </svg>
            <div className="mt-2 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-xs text-slate-300"><span>● Folders</span><span>● Source files</span><span>─ Relationships</span></div>
          </div>
        </motion.div>

        {/* Example Repos */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="w-full max-w-6xl mx-auto mb-20"
        >
          <p className="text-center ui-body text-muted-foreground mb-6">
            Or open an example repository
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {EXAMPLE_REPOS.slice(0, 4).map((repo) => (
              <motion.button
                key={`${repo.owner}/${repo.repo}`}
                variants={fadeSlideUp}
                whileHover={{ y: -3 }}
                transition={transitions.base}
                onClick={() => {
                  setIsNavigating(true);
                  router.push(`/${repo.owner}/${repo.repo}`);
                }}
                className="surface-neo-soft interactive-lift p-4 text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground group-hover:text-indigo transition-colors">
                    {repo.repo}
                  </span>
                </div>
                <p className="ui-micro text-muted-foreground mb-2 line-clamp-2">
                  {repo.description}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="ui-micro text-muted-foreground/60">
                    {repo.owner}
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {repo.language}
                  </Badge>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* When to use Gitvize */}
        <motion.section
          variants={fadeSlideUp}
          initial="hidden"
          animate="show"
          transition={{ ...transitions.soft, delay: 0.2 }}
          className="w-full max-w-5xl mx-auto mb-20"
        >
          <h2 className="text-3xl font-bold text-center mb-12">
            When to use <span className="gradient-text">Gitvize</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {USE_CASES.map((item) => (
              <div
                key={item.title}
                className="surface-neo-soft interactive-lift p-6 rounded-2xl"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${item.iconBg}`}>
                  {item.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* How it Works */}
        <motion.section
          variants={fadeSlideUp}
          initial="hidden"
          animate="show"
          transition={{ ...transitions.soft, delay: 0.25 }}
          className="w-full max-w-4xl mx-auto mb-24"
        >
          <h2 className="text-3xl font-bold text-center mb-12">
            How It <span className="gradient-text">Works</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <div
                key={step.title}
                className="surface-neo-soft interactive-lift p-6 text-center relative"
              >
                <div className="absolute -top-3 left-6 bg-indigo text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {i + 1}
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo/10 flex items-center justify-center mx-auto mb-4 text-indigo">
                  {iconMap[step.icon]}
                </div>
                <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-border/30 py-8 text-center text-sm text-muted-foreground w-full">
          <span>© 2026 Gitvize</span>
          <span className="mx-3 text-border">·</span>
          <a
            href="https://github.com/Aksh1810/Gitvize"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Open Source
          </a>
        </footer>
      </main>

      <GitHubTokenModal
        open={githubTokenOpen}
        onOpenChange={setGithubTokenOpen}
        onSave={async (token) => {
          if (!pendingRepo) return;
          if (!token) {
            setAccessHint("A GitHub token is required for private repositories.");
            return;
          }

          try {
            const res = await checkAccess(pendingRepo.owner, pendingRepo.repo, token);
            if (res.ok) {
              setOneTimeGitHubToken(token);
              setAccessHint(null);
              router.push(`/${pendingRepo.owner}/${pendingRepo.repo}`);
              return;
            }

            if (res.status === 401 || res.status === 403 || res.status === 404) {
              setAccessHint("Token is incorrect or missing required scopes (repo/read:org) for this private repository.");
              return;
            }

            setAccessHint("Unable to verify token right now. Please try again.");
          } catch {
            setAccessHint("Network error while validating token. Please try again.");
          }
        }}
      />
    </div>
  );
}
