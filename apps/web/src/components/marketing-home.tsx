import {
  ArrowRight,
  Check,
  Code,
  Database,
  GitBranch,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  {
    icon: Code,
    title: "Drop into any stack",
    copy: "Use one script tag, rendered HTML, a raw JSON API, or the typed SDK. No iframe and no forced frontend.",
  },
  {
    icon: MagnifyingGlass,
    title: "Search-ready by default",
    copy: "Clean URLs, metadata, JSON-LD, RSS, sitemaps, author profiles, and an actionable writing-side SEO review.",
  },
  {
    icon: GitBranch,
    title: "A real editorial workflow",
    copy: "Draft, schedule, pin, revise, redirect, localize, review in teams, and recover previous versions.",
  },
  {
    icon: Database,
    title: "Portable on purpose",
    copy: "Self-host the full stack and export posts, authors, categories, redirects, and metadata whenever you want.",
  },
  {
    icon: ShieldCheck,
    title: "No feature tiers",
    copy: "Permissions, audit history, APIs, staging-friendly configuration, and every publishing feature ship in the open source project.",
  },
  {
    icon: Sparkle,
    title: "Agent-first surfaces",
    copy: "The REST contract, TypeScript SDK, CLI, and MCP server stay aligned so humans and agents use the same rules.",
  },
];

export function MarketingHome() {
  return (
    <main className="overflow-hidden bg-[#f4f3ed]">
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Logo className="text-lg" />
        <div className="hidden items-center gap-7 text-sm font-medium text-[#657077] md:flex">
          <a href="#features">Features</a>
          <a href="#architecture">Architecture</a>
          <Link href="/b/fieldnotes">Live blog</Link>
          <a href="https://github.com/prosewire/prosewire">GitHub</a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#172329] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px"
          >
            Open dashboard <ArrowRight className="size-4" />
          </Link>
        </div>
      </nav>

      <section className="paper-grid relative border-y border-[#dedfd9]">
        <div className="absolute -left-28 top-10 size-72 rounded-full bg-[#ef6848]/12 blur-3xl" />
        <div className="absolute -right-20 bottom-0 size-96 rounded-full bg-[#a7c9c0]/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d4d6cf] bg-white/75 px-3 py-1.5 text-xs font-semibold text-[#4f5c61] shadow-sm backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#1f6e52]" /> Apache 2.0
              licensed · self-hostable
            </div>
            <h1 className="display-font max-w-3xl text-[3.45rem] leading-[0.98] text-[#172329] sm:text-7xl lg:text-[5.25rem]">
              The blog layer your website was missing.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#5f6a70]">
              Prosewire is portable publishing infrastructure for teams that
              want a great editor, clean SEO, and a blog that feels native to
              any site—without WordPress or a monthly tax.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ef6848] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgb(239_104_72_/_0.25)] transition hover:-translate-y-px hover:bg-[#e15d3d]"
              >
                Run it locally <ArrowRight className="size-4" />
              </Link>
              <a
                href="#architecture"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cfd2cb] bg-white px-5 text-sm font-semibold text-[#27353b] transition hover:bg-[#faf9f5]"
              >
                See how it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#69757a]">
              {["Unlimited posts", "Every API included", "Your database"].map(
                (item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-[#1f6e52]" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[590px]">
            <div className="absolute -inset-3 rotate-2 rounded-[28px] bg-[#172329]" />
            <div className="relative overflow-hidden rounded-[24px] border border-[#26373f] bg-[#f8f7f2] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#dedfd9] px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ef6848]" />
                  <span className="size-2.5 rounded-full bg-[#e6b64d]" />
                  <span className="size-2.5 rounded-full bg-[#71a68a]" />
                </div>
                <span className="font-mono text-[10px] text-[#7d878b]">
                  prosewire.local/editor
                </span>
                <span className="rounded-md bg-[#172329] px-2 py-1 text-[9px] font-semibold text-white">
                  Publish
                </span>
              </div>
              <div className="grid min-h-[430px] grid-cols-[1fr_150px] sm:grid-cols-[1fr_190px]">
                <div className="border-r border-[#dedfd9] p-5 sm:p-7">
                  <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#9aa1a4]">
                    Draft
                  </div>
                  <div className="display-font mt-5 text-3xl leading-tight">
                    Your content should outlive your website stack
                  </div>
                  <div className="mt-6 h-2 w-11/12 rounded bg-[#d9dcd5]" />
                  <div className="mt-2 h-2 w-full rounded bg-[#e5e6e1]" />
                  <div className="mt-2 h-2 w-8/12 rounded bg-[#e5e6e1]" />
                  <div className="mt-8 text-sm font-bold">
                    What portable content looks like
                  </div>
                  <div className="mt-4 space-y-3 text-xs text-[#647076]">
                    {[
                      "One canonical content store",
                      "Stable URLs and redirects",
                      "Rendered HTML and a raw API",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="grid size-4 place-items-center rounded bg-[#fee9df] text-[#c94a2d]">
                          ✓
                        </span>
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 rounded-xl border border-[#dedfd9] bg-white p-4">
                    <div className="h-2 w-2/3 rounded bg-[#d8dad4]" />
                    <div className="mt-2 h-2 w-5/6 rounded bg-[#ebece8]" />
                  </div>
                </div>
                <aside className="bg-white p-4 sm:p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#9aa1a4]">
                    Content checks
                  </div>
                  <div
                    className="mx-auto mt-5 grid size-20 place-items-center rounded-full"
                    style={{
                      background: "conic-gradient(#1f6e52 0 86%, #e8eae5 86%)",
                    }}
                  >
                    <div className="grid size-16 place-items-center rounded-full bg-white text-xl font-bold">
                      86
                    </div>
                  </div>
                  <p className="mt-3 text-center text-[10px] font-semibold text-[#1f6e52]">
                    Ready to publish
                  </p>
                  <div className="mt-6 space-y-3">
                    {[
                      "Search title",
                      "Description",
                      "Structure",
                      "Alt text",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className="flex items-center justify-between border-b border-[#ecece8] pb-2 text-[10px]"
                      >
                        <span>{item}</span>
                        <span
                          className={
                            index === 3 ? "text-[#d19020]" : "text-[#1f6e52]"
                          }
                        >
                          {index === 3 ? "Review" : "Pass"}
                        </span>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ef6848]">
            Everything is included
          </p>
          <h2 className="display-font mt-4 text-4xl leading-tight sm:text-5xl">
            A serious publishing system, minus the lock-in.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#687279]">
            Built around the capabilities content teams actually use: fast
            integration, editorial control, trustworthy search metadata, and
            ownership all the way down.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-[#d9dbd5] bg-[#d9dbd5] md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="bg-[#faf9f5] p-7 transition hover:bg-white"
            >
              <div className="grid size-10 place-items-center rounded-xl border border-[#dedfd9] bg-white text-[#ef6848] shadow-sm">
                <feature.icon className="size-4.5" />
              </div>
              <h3 className="mt-7 text-base font-semibold tracking-[-.02em]">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#69757a]">
                {feature.copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="architecture"
        className="border-y border-[#dedfd9] bg-[#172329] text-white"
      >
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 lg:grid-cols-[.78fr_1.22fr] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#f58a6f]">
              One source, every surface
            </p>
            <h2 className="display-font mt-4 text-4xl leading-tight sm:text-5xl">
              Start with copy-paste. Keep all the escape hatches.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#aeb8bc]">
              Prosewire keeps the contract in the center. The dashboard, public
              reader, embed, SDK, CLI, and MCP server all share the same content
              rules.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "01",
                "JavaScript embed",
                "A tiny loader that inherits the host site’s type and color.",
              ],
              [
                "02",
                "Rendered API",
                "Sanitized, semantic HTML for server or client integration.",
              ],
              [
                "03",
                "Raw API + SDK",
                "Structured content and relationships for custom experiences.",
              ],
              [
                "04",
                "CLI + MCP",
                "Automation and agent workflows with declared operation risk.",
              ],
            ].map(([n, title, copy]) => (
              <div
                key={n}
                className="rounded-2xl border border-white/10 bg-white/[.045] p-5"
              >
                <span className="font-mono text-[10px] text-[#f58a6f]">
                  {n}
                </span>
                <h3 className="mt-8 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#aeb8bc]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-[#778186] sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <Logo className="text-[#172329]" />
        <p>Open source publishing infrastructure. Built to be owned.</p>
      </footer>
    </main>
  );
}
