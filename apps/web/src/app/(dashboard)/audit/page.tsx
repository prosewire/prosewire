import { History, ShieldCheck } from "lucide-react";
import { loadDashboardAudit } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Audit history" };

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

export default async function AuditPage() {
  const { context, entries } = dashboardData(await loadDashboardAudit());
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Workspace security</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Audit history</h1>
      <p className="mt-2 text-sm text-[#6e787d]">The latest workspace, team, publication, content, scheduler, and API-key changes across {context.workspace.name}.</p>

      <section className="card mt-7 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e3de] px-5 py-4">
          <div className="flex items-center gap-2"><History className="size-4 text-[#ef6848]" /><h2 className="text-sm font-semibold">Recent events</h2></div>
          <span className="text-xs text-[#8a9397]">Latest {entries.length} of 100</span>
        </div>
        <div className="divide-y divide-[#ecece8]">
          {entries.map((entry) => (
            <article key={entry.id} className="grid gap-3 bg-white px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#f0f8f3] text-[#1f6e52]"><ShieldCheck className="size-3.5" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold capitalize">{label(entry.action)}</p>
                  <p className="mt-1 truncate text-[11px] text-[#7b8589]">{entry.actorName ?? entry.actorEmail ?? "System"} · {entry.publicationName ?? "Workspace"} · {label(entry.entityType)}</p>
                </div>
              </div>
              <time className="text-xs text-[#8a9397]" dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</time>
            </article>
          ))}
          {!entries.length ? <div className="bg-white px-5 py-16 text-center"><p className="text-sm font-semibold">No audit events yet</p><p className="mt-1 text-xs text-[#8a9397]">Workspace changes will appear here.</p></div> : null}
        </div>
      </section>
    </main>
  );
}
