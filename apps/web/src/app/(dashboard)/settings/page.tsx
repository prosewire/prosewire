import { CheckCircle2, CircleAlert, Database, Palette, ShieldCheck } from "lucide-react";
import { updateBlogSettings } from "@/server/actions";
import { loadDashboardSettings } from "@/server/page-entrypoints";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [query, blog] = await Promise.all([searchParams, loadDashboardSettings()]);
  const { error, saved } = query;
  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Blog settings</h1><p className="mt-2 text-sm text-[#6e787d]">Identity, public URL, styling, and ownership controls.</p>
      {saved === "1" ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" />Settings saved and public views refreshed.</div> : null}
      {error ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700"><CircleAlert className="size-4" />{error}</div> : null}
      <form action={updateBlogSettings} className="mt-6 space-y-4">
        <input type="hidden" name="id" value={blog.id} />
        <section className="card p-5 sm:p-6"><div className="flex items-center gap-2"><Palette className="size-4 text-[#ef6848]" /><h2 className="text-sm font-semibold">Publication identity</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Name<input name="name" defaultValue={blog.name} className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal outline-none focus:border-[#ef6848]" /></label><label className="text-xs font-semibold">Default locale<input name="locale" defaultValue={blog.locale} className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal outline-none focus:border-[#ef6848]" /></label><label className="text-xs font-semibold sm:col-span-2">Description<textarea name="description" defaultValue={blog.description} className="mt-2 min-h-24 w-full rounded-xl border border-[#d9dbd5] px-3 py-2.5 text-sm font-normal leading-6 outline-none focus:border-[#ef6848]" /></label><label className="text-xs font-semibold">Accent color<div className="mt-2 flex h-10 items-center gap-2 rounded-xl border border-[#d9dbd5] bg-white px-2"><input name="accentColor" type="color" defaultValue={blog.accentColor} className="size-7 rounded border-0 bg-transparent" /><span className="font-mono text-xs text-[#687279]">{blog.accentColor}</span></div></label><label className="text-xs font-semibold">Canonical public URL<input name="publicUrl" defaultValue={blog.publicUrl ?? ""} placeholder="https://example.com/blog" className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal outline-none focus:border-[#ef6848]" /></label></div></section>
        <section className="card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#ef6848]" /><h2 className="text-sm font-semibold">Scoped custom CSS</h2></div><p className="mt-2 text-xs leading-5 text-[#7b8589]">Use stable <code className="rounded bg-[#f0f1ed] px-1">pw-*</code> classes. CSS is emitted only on this blog’s rendered surfaces.</p><textarea name="customCss" defaultValue={blog.customCss} placeholder={`.pw-post-title {\n  letter-spacing: -0.04em;\n}`} className="mt-4 min-h-48 w-full rounded-xl border border-[#d9dbd5] bg-[#172329] px-4 py-3 font-mono text-xs leading-6 text-[#dfe6e8] outline-none focus:border-[#ef6848]" /></section>
        <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef0ec]"><Database className="size-4 text-[#657077]" /></span><div><h2 className="text-sm font-semibold">Data ownership</h2><p className="mt-1 text-xs leading-5 text-[#7b8589]">Postgres is the source of truth. CSV exports are available from the posts screen.</p></div></div><button className="h-10 rounded-xl bg-[#172329] px-5 text-sm font-semibold text-white shadow-sm">Save settings</button></section>
      </form>
    </main>
  );
}
