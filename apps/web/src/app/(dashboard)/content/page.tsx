import { BracketsCurly, Folder, Quotes, User } from "@phosphor-icons/react/ssr";
import { loadDashboardContentLibrary } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Content library" };

export default async function ContentPage() {
  const { authors, categories, snippets, redirects } = dashboardData(
    await loadDashboardContentLibrary(),
  );
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Reusable content</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
        Content library
      </h1>
      <p className="mt-2 text-sm text-[#6e787d]">
        Keep people, taxonomy, snippets, and URL history organized.
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {[
          {
            icon: User,
            title: "Authors",
            count: authors.length,
            items: authors.map(
              (item) => `${item.name} · ${item.jobTitle ?? "Contributor"}`,
            ),
          },
          {
            icon: Folder,
            title: "Categories",
            count: categories.length,
            items: categories.map((item) => `${item.name} · /${item.slug}`),
          },
          {
            icon: Quotes,
            title: "Smart snippets",
            count: snippets.length,
            items: snippets.map((item) => `${item.name} · {{${item.key}}}`),
          },
          {
            icon: BracketsCurly,
            title: "Redirects",
            count: redirects.length,
            items: redirects.length
              ? redirects.map((item) => `${item.fromPath} → ${item.toPath}`)
              : ["Created automatically when a post slug changes"],
          },
        ].map((group) => (
          <section key={group.title} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-[#f2f2ee] text-[#657077]">
                  <group.icon className="size-4" />
                </span>
                <h2 className="text-sm font-semibold">{group.title}</h2>
              </div>
              <span className="text-xs font-semibold text-[#8a9397]">
                {group.count}
              </span>
            </div>
            <div className="mt-5 divide-y divide-[#ecece8]">
              {group.items.map((item) => (
                <div key={item} className="py-3 text-xs text-[#5f6b70]">
                  {item}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
