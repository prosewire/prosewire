import { Braces, Code2, ExternalLink, KeyRound, PackageOpen, TerminalSquare } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { loadDashboardIntegration } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Integrate" };

function CodeBlock({ children }: { children: string }) {
  return <div className="relative mt-3 overflow-x-auto rounded-xl bg-[#172329] p-4 font-mono text-[11px] leading-6 text-[#dce3e5]"><div className="absolute right-2 top-2"><CopyButton value={children} /></div><pre className="pr-16"><code>{children}</code></pre></div>;
}

export default async function IntegratePage() {
  const { blog, origin } = dashboardData(await loadDashboardIntegration());
  const embed = `<div data-prosewire="${blog.slug}"></div>\n<script async src="${origin}/embed.js" data-blog="${blog.slug}"></script>`;
  const sdk = `import { createPublicClient } from "@prosewire/sdk";\n\nconst blog = createPublicClient({\n  baseUrl: "${origin}",\n  blog: "${blog.slug}",\n});\n\nconst posts = await blog.listPosts();`;
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Developer surfaces</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Integrate anywhere</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e787d]">Start with two lines of HTML, or take complete control through the same typed content contract.</p>
      <section className="card mt-7 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fee9df] text-[#c54a2f]"><Code2 className="size-4.5" /></span><div><h2 className="text-sm font-semibold">JavaScript embed</h2><p className="mt-1 text-xs leading-5 text-[#7a8489]">Renders semantic HTML into the host page and inherits surrounding typography. No iframe.</p></div></div><CodeBlock>{embed}</CodeBlock></section>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-5"><Braces className="size-4.5 text-[#ef6848]" /><h2 className="mt-4 text-sm font-semibold">Raw JSON API</h2><p className="mt-2 text-xs leading-5 text-[#7a8489]">Published posts with authors, categories, HTML, and Markdown.</p><CodeBlock>{`GET ${origin}/api/public/${blog.slug}/posts`}</CodeBlock></section>
        <section className="card p-5"><PackageOpen className="size-4.5 text-[#ef6848]" /><h2 className="mt-4 text-sm font-semibold">Rendered API</h2><p className="mt-2 text-xs leading-5 text-[#7a8489]">Ready-to-place blog indexes and article bodies.</p><CodeBlock>{`GET ${origin}/api/rendered/${blog.slug}/`}</CodeBlock></section>
      </div>
      <section className="card mt-4 p-5 sm:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eef0ec] text-[#59666b]"><TerminalSquare className="size-4.5" /></span><div><h2 className="text-sm font-semibold">TypeScript SDK</h2><p className="mt-1 text-xs text-[#7a8489]">Typed public and private clients.</p></div></div><span className="rounded-lg bg-[#f0f1ed] px-2 py-1 font-mono text-[10px]">@prosewire/sdk</span></div><CodeBlock>{sdk}</CodeBlock></section>
      <section className="mt-4 grid gap-4 md:grid-cols-2"><div className="card p-5"><KeyRound className="size-4.5 text-[#ef6848]" /><h2 className="mt-4 text-sm font-semibold">Scoped API keys</h2><p className="mt-2 text-xs leading-5 text-[#7a8489]">Provision a unique key through your deployment configuration. Keys are stored as SHA-256 hashes and enforce separate read and write scopes.</p></div><a href={`/b/${blog.slug}`} target="_blank" rel="noreferrer" className="card flex items-center justify-between p-5 transition hover:-translate-y-px"><div><ExternalLink className="size-4.5 text-[#ef6848]" /><h2 className="mt-4 text-sm font-semibold">Open the native reader</h2><p className="mt-2 text-xs text-[#7a8489]">Preview the full server-rendered blog.</p></div><span className="text-xl text-[#adb3b5]">→</span></a></section>
    </main>
  );
}
