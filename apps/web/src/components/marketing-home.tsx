import {
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  Check,
  Code,
  Copy,
  Database,
  FileText,
  GithubLogo,
  Globe,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  TerminalWindow,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Logo } from "@/components/logo";

const features = [
  {
    icon: Code,
    title: "Use the frontend you already have",
    copy: "Add semantic HTML, a small script, the raw API, or the typed SDK. Prosewire does not put your blog in an iframe.",
  },
  {
    icon: MagnifyingGlass,
    title: "Publish search-ready pages",
    copy: "Every post includes clean URLs, metadata, JSON-LD, RSS, sitemaps, author pages, and writing-side SEO checks.",
  },
  {
    icon: FileText,
    title: "Give editors a real workflow",
    copy: "Draft, schedule, review, localize, pin, revise, redirect, and restore content without asking a developer.",
  },
  {
    icon: Database,
    title: "Keep the content portable",
    copy: "Self-host the full stack and export posts, authors, categories, redirects, and metadata in documented formats.",
  },
  {
    icon: ShieldCheck,
    title: "Get every feature in one project",
    copy: "Permissions, audit history, APIs, and staging-friendly configuration all ship under the Apache 2.0 license.",
  },
  {
    icon: Sparkle,
    title: "Let agents use the same rules",
    copy: "The REST API, TypeScript SDK, CLI, and MCP server share one contract with the dashboard and public reader.",
  },
];

const sidebarItems = [
  [BookOpenText, "Overview"],
  [FileText, "Posts"],
  [Globe, "Publications"],
  [BracketsCurly, "Integrations"],
] as const;

export function MarketingHome({ allowSignUp }: { allowSignUp: boolean }) {
  const primaryHref = allowSignUp ? "/sign-up" : "/sign-in";
  const primaryLabel = allowSignUp ? "Create account" : "Sign in";

  return (
    <main className="marketing-home min-h-screen overflow-hidden bg-[#fbfbfc] text-[#18181b]">
      <header className="sticky top-0 z-50 border-b border-black/[.07] bg-[#fbfbfc]/85 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" aria-label="Prosewire home">
            <Logo className="text-[15px]" />
          </Link>

          <div className="hidden items-center gap-1 text-sm text-[#5f6068] md:flex">
            <a
              className="rounded-md px-3 py-2 transition hover:bg-black/[.04] hover:text-black"
              href="#features"
            >
              Features
            </a>
            <a
              className="rounded-md px-3 py-2 transition hover:bg-black/[.04] hover:text-black"
              href="#quickstart"
            >
              Quick start
            </a>
            <a
              className="rounded-md px-3 py-2 transition hover:bg-black/[.04] hover:text-black"
              href="https://prosewire.com/docs/getting-started/"
            >
              Docs
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/prosewire/prosewire"
              aria-label="Prosewire on GitHub"
              className="hidden size-9 place-items-center rounded-md text-[#5f6068] transition hover:bg-black/[.04] hover:text-black sm:grid"
            >
              <GithubLogo className="size-[18px]" />
            </a>
            <Link
              href="/sign-in"
              style={{ color: "#fff" }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#18181b] px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#2d2d31]"
            >
              Sign in <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="marketing-grid relative border-b border-black/[.07]">
        <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-0 pt-20 text-center sm:pt-24 lg:px-8 lg:pt-28">
          <a
            href="https://github.com/prosewire/prosewire"
            style={{ color: "#55565d" }}
            className="inline-flex items-center gap-2 rounded-full border border-black/[.08] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#55565d] shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] backdrop-blur transition hover:border-black/15 hover:text-black"
          >
            <span className="size-1.5 rounded-full bg-[#ef6848] shadow-[0_0_0_3px_rgb(239_104_72_/_0.12)]" />
            Open source under Apache 2.0
            <ArrowRight className="size-3" />
          </a>

          <h1 className="mx-auto mt-7 max-w-[930px] text-balance text-[3.25rem] font-semibold leading-[.98] tracking-[-.055em] text-[#111113] sm:text-[4.65rem] lg:text-[5.8rem]">
            Publishing that fits your website.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-[#63646c] sm:text-lg sm:leading-8">
            Prosewire gives your team an editor, publishing workflows, and clean
            content APIs. You keep the frontend, the database, and every exit.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              style={{ color: "#fff" }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#18181b] px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(24_24_27_/_0.12)] transition hover:-translate-y-px hover:bg-[#2d2d31] sm:w-auto"
            >
              {primaryLabel} <ArrowRight className="size-4" />
            </Link>
            <a
              href="#quickstart"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-5 text-sm font-medium text-[#313137] shadow-sm transition hover:-translate-y-px hover:bg-[#f7f7f8] sm:w-auto"
            >
              <TerminalWindow className="size-4" /> Start locally
            </a>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[#6c6d75]">
            {["No iframe", "No feature tiers", "Portable exports"].map(
              (item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-[#2f8f67]" weight="bold" />
                  {item}
                </span>
              ),
            )}
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl pb-16 sm:mt-20 lg:pb-24">
            <div className="absolute -inset-x-10 -bottom-8 top-20 rounded-full bg-[#7c3aed]/[.08] blur-3xl" />
            <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#0d0e12] text-left shadow-[0_30px_90px_rgb(20_20_25_/_0.18)] ring-1 ring-white">
              <div className="flex h-12 items-center justify-between border-b border-white/[.08] px-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                  </div>
                  <span className="hidden font-mono text-[10px] text-white/40 sm:inline">
                    prosewire.local/dashboard
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/45">
                  <span className="hidden rounded-md border border-white/10 bg-white/[.04] px-2 py-1 sm:inline">
                    Preview
                  </span>
                  <span className="rounded-md bg-[#ef6848] px-2.5 py-1 font-semibold text-white">
                    Publish
                  </span>
                </div>
              </div>

              <div className="grid min-h-[500px] grid-cols-1 md:grid-cols-[190px_1fr] lg:grid-cols-[210px_1fr_220px]">
                <aside className="hidden border-r border-white/[.08] bg-white/[.015] p-3 md:block">
                  <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-white/90">
                    <span className="grid size-6 place-items-center rounded-md bg-white text-[10px] font-bold text-black">
                      P
                    </span>
                    Fieldnotes
                  </div>
                  <div className="mt-3 space-y-1">
                    {sidebarItems.map(([Icon, label], index) => (
                      <div
                        key={label}
                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs ${
                          index === 1
                            ? "bg-white/[.09] font-medium text-white"
                            : "text-white/45"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-7 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/25">
                    Workspace
                  </div>
                  <div className="mt-3 space-y-1.5 px-2 text-[11px] text-white/40">
                    <p>Analytics</p>
                    <p>Team</p>
                    <p>Settings</p>
                  </div>
                </aside>

                <div className="bg-[#fbfbfc] p-5 text-[#18181b] sm:p-8 lg:p-10">
                  <div className="flex items-center justify-between border-b border-black/[.07] pb-5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8b8c93]">
                        Draft
                      </div>
                      <p className="mt-1 text-xs text-[#6b6c74]">
                        Saved a moment ago
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="More post actions"
                      className="rounded-md border border-black/[.08] bg-white px-2.5 py-1.5 text-xs text-[#666770] shadow-sm"
                    >
                      •••
                    </button>
                  </div>
                  <article className="mx-auto max-w-2xl pt-8">
                    <p className="text-xs font-medium text-[#ef6848]">
                      Engineering
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-.04em] sm:text-[2.6rem]">
                      Your content should outlive your website stack
                    </h2>
                    <p className="mt-5 text-sm leading-6 text-[#666770] sm:text-[15px]">
                      A canonical content store lets your team change frameworks
                      without rebuilding years of editorial work.
                    </p>
                    <div className="mt-8 border-t border-black/[.07] pt-6">
                      <h3 className="text-sm font-semibold">
                        What portable content includes
                      </h3>
                      <div className="mt-4 grid gap-2 text-xs text-[#56575f] sm:grid-cols-2">
                        {[
                          "Stable URLs and redirects",
                          "Rendered and raw APIs",
                          "Documented exports",
                          "Framework-native routes",
                        ].map((item) => (
                          <div
                            key={item}
                            className="flex items-center gap-2 rounded-md border border-black/[.07] bg-white px-3 py-2.5"
                          >
                            <Check
                              className="size-3.5 text-[#2f8f67]"
                              weight="bold"
                            />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-7 rounded-lg border border-black/[.07] bg-[#f3f3f5] p-4">
                      <div className="h-2 w-5/6 rounded-full bg-black/[.09]" />
                      <div className="mt-2.5 h-2 w-full rounded-full bg-black/[.06]" />
                      <div className="mt-2.5 h-2 w-2/3 rounded-full bg-black/[.06]" />
                    </div>
                  </article>
                </div>

                <aside className="hidden border-l border-white/[.08] bg-white/[.015] p-5 lg:block">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/35">
                      Content checks
                    </span>
                    <span className="text-xs font-semibold text-[#76d4a7]">
                      86
                    </span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.08]">
                    <div className="h-full w-[86%] rounded-full bg-[#76d4a7]" />
                  </div>
                  <div className="mt-7 space-y-4">
                    {[
                      "Search title",
                      "Description",
                      "Structure",
                      "Alt text",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className="flex items-center justify-between border-b border-white/[.07] pb-3 text-[11px]"
                      >
                        <span className="text-white/55">{item}</span>
                        <span
                          className={
                            index === 3 ? "text-[#f0ad68]" : "text-[#76d4a7]"
                          }
                        >
                          {index === 3 ? "Review" : "Pass"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 rounded-lg border border-white/[.08] bg-white/[.035] p-3">
                    <p className="text-[10px] font-medium text-white/70">
                      Canonical URL
                    </p>
                    <p className="mt-2 truncate font-mono text-[9px] text-white/30">
                      /blog/content-outlives-stack
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ef6848]">
            One publishing system
          </p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
            The useful parts are already connected.
          </h2>
          <p className="mt-5 text-pretty text-base leading-7 text-[#676870]">
            Editors get a focused workspace. Developers get predictable output.
            Both work from the same content model.
          </p>
        </div>

        <div className="mt-14 grid overflow-hidden rounded-xl border border-black/[.08] bg-black/[.08] shadow-sm md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="bg-white p-7 transition hover:bg-[#fcfcfd] lg:p-8"
            >
              <feature.icon className="size-5 text-[#ef6848]" />
              <h3 className="mt-8 text-[15px] font-semibold tracking-[-.015em]">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#6a6b73]">
                {feature.copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="quickstart"
        className="border-y border-black/[.07] bg-[#f4f4f6]"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 lg:grid-cols-[.82fr_1.18fr] lg:px-8 lg:py-28">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ef6848]">
              Quick start
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
              Add publishing without rebuilding your site.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#676870]">
              Point the scaffolder at a Prosewire deployment. It detects Next.js
              or Astro and adds thin native routes for your blog.
            </p>
            <a
              href="https://prosewire.com/docs/getting-started/"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#222226] transition hover:text-[#ef6848]"
            >
              Read the setup guide <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-[#0d0e12] shadow-[0_24px_70px_rgb(24_24_27_/_0.12)]">
            <div className="flex h-12 items-center justify-between border-b border-white/[.08] px-4">
              <div className="flex items-center gap-2 text-xs text-white/45">
                <TerminalWindow className="size-4" /> Terminal
              </div>
              <button
                type="button"
                aria-label="Copy install command"
                className="text-white/35 transition hover:text-white/70"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <div className="overflow-x-auto p-5 font-mono text-[12px] leading-7 sm:p-7 sm:text-[13px]">
              <p>
                <span className="text-[#76d4a7]">$</span>{" "}
                <span className="text-white/85">
                  pnpm create prosewire@latest \
                </span>
              </p>
              <p className="pl-4 text-white/55">
                --url https://your-prosewire-deployment \
              </p>
              <p className="pl-4 text-white/55">--blog fieldnotes \</p>
              <p className="pl-4 text-white/55">--route /blog</p>
              <p className="mt-5 text-white/25">
                # Next.js or Astro routes are ready to style.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 text-center lg:px-8 lg:py-32">
        <div className="relative overflow-hidden rounded-2xl border border-black/[.08] bg-[#18181b] px-6 py-16 text-white shadow-xl sm:px-12 sm:py-20">
          <div className="marketing-cta-grid pointer-events-none absolute inset-0" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f58a6f]">
              Your content, your rules
            </p>
            <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
              A blog backend you can keep.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/55">
              Run Prosewire on your own infrastructure, connect the frontend you
              want, and export the complete publication whenever you need it.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                style={{ color: "#18181b" }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#18181b] transition hover:bg-[#f1f1f2]"
              >
                {primaryLabel} <ArrowRight className="size-4" />
              </Link>
              <a
                href="https://github.com/prosewire/prosewire"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[.04] px-5 text-sm font-medium text-white transition hover:bg-white/[.08]"
              >
                <GithubLogo className="size-4" /> View source
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-[#777880] sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Logo className="text-[#18181b]" />
          <p>Open-source publishing infrastructure, built to be owned.</p>
        </div>
      </footer>
    </main>
  );
}
