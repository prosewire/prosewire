import {
  BracketsCurly,
  CloudArrowUp,
  Folder,
  ImageSquare,
  Quotes,
  Trash,
  User,
} from "@phosphor-icons/react/ssr";
import { backupMediaAsset, deleteMediaAsset } from "@/server/actions";
import { loadDashboardContentLibrary } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Content library" };

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(1)} GB`;
}

export default async function ContentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const [query, result] = await Promise.all([
    searchParams,
    loadDashboardContentLibrary(),
  ]);
  const { authors, categories, snippets, redirects, blog, media } =
    dashboardData(result);
  const usagePercent =
    media.usage.quotaBytes === 0
      ? 0
      : Math.min(100, (media.usage.usedBytes / media.usage.quotaBytes) * 100);
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Reusable content</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
        Content library
      </h1>
      <p className="mt-2 text-sm text-[#6e787d]">
        Keep media, people, taxonomy, snippets, and URL history organized.
      </p>
      {query.error ? (
        <p className="mt-5 rounded-xl border border-[#efc8be] bg-[#fff6f3] px-4 py-3 text-xs text-[#a44230]">
          {query.error}
        </p>
      ) : null}

      <section className="card mt-7 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#f2f2ee] text-[#657077]">
              <ImageSquare className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Media</h2>
              <p className="mt-0.5 text-[10px] text-[#7b8589]">
                {media.items.length} assets
              </p>
            </div>
          </div>
          <p className="text-right text-[10px] leading-4 text-[#657077]">
            {formatBytes(media.usage.usedBytes)} of{" "}
            {formatBytes(media.usage.quotaBytes)}
            <br />
            {formatBytes(media.usage.remainingBytes)} available
          </p>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e8e9e4]">
          <div
            className="h-full rounded-full bg-[#ef6848]"
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {!media.configured ? (
          <p className="mt-5 rounded-xl border border-dashed border-[#d7d9d3] px-4 py-5 text-xs leading-5 text-[#687279]">
            Media storage is not configured. Editors can still use external
            image URLs. Configure the S3-compatible storage variables to enable
            direct uploads.
          </p>
        ) : media.items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-[#d7d9d3] px-4 py-5 text-center text-xs text-[#7b8589]">
            Upload a cover image from the post editor to start the library.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.items.map((asset) => (
              <article
                key={asset.id}
                className="overflow-hidden rounded-xl border border-[#e0e1dc] bg-white"
              >
                {asset.url ? (
                  <div
                    role="img"
                    aria-label={asset.filename}
                    className="aspect-[1.91/1] bg-[#efeee8] bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${JSON.stringify(asset.url)})`,
                    }}
                  />
                ) : (
                  <div className="grid aspect-[1.91/1] place-items-center bg-[#efeee8] text-[10px] font-semibold uppercase tracking-wide text-[#7b8589]">
                    {asset.status}
                  </div>
                )}
                <div className="p-3">
                  <p
                    className="truncate text-xs font-semibold"
                    title={asset.filename}
                  >
                    {asset.filename}
                  </p>
                  <p className="mt-1 text-[9px] text-[#7b8589]">
                    {asset.width && asset.height
                      ? `${asset.width} × ${asset.height} · `
                      : ""}
                    {formatBytes(asset.storageBytes)}
                  </p>
                  <p className="mt-2 text-[9px] leading-4 text-[#687279]">
                    {asset.references.length === 0
                      ? "Not used by a post"
                      : `Used by ${asset.references.map((reference) => reference.title).join(", ")}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {media.backupConfigured && asset.status === "ready" ? (
                      asset.backedUpAt ? (
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#eef6f1] px-2.5 text-[9px] font-semibold text-[#1f6e52]">
                          <CloudArrowUp className="size-3" /> Backed up
                        </span>
                      ) : (
                        <form action={backupMediaAsset}>
                          <input type="hidden" name="blogId" value={blog.id} />
                          <input
                            type="hidden"
                            name="assetId"
                            value={asset.id}
                          />
                          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d8dad4] px-2.5 text-[9px] font-semibold">
                            <CloudArrowUp className="size-3" /> Back up
                          </button>
                        </form>
                      )
                    ) : null}
                    {asset.references.length === 0 ? (
                      <details className="relative">
                        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[#e6c8c0] px-2.5 text-[9px] font-semibold text-[#a44230]">
                          <Trash className="size-3" /> Delete
                        </summary>
                        <form
                          action={deleteMediaAsset}
                          className="mt-2 w-48 rounded-xl border border-[#e6c8c0] bg-[#fffaf8] p-3"
                        >
                          <input type="hidden" name="blogId" value={blog.id} />
                          <input
                            type="hidden"
                            name="assetId"
                            value={asset.id}
                          />
                          <p className="text-[10px] leading-4 text-[#687279]">
                            Delete the primary objects? A configured backup is
                            retained.
                          </p>
                          <button className="mt-2 h-8 w-full rounded-lg bg-[#a44230] px-2.5 text-[9px] font-semibold text-white">
                            Confirm delete
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
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
