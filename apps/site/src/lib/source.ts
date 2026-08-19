import path from "node:path";
import { getCollection, type CollectionEntry } from "astro:content";
import { structure, type StructuredData } from "fumadocs-core/mdx-plugins";
import { loader, type StaticSource } from "fumadocs-core/source";

type DocsEntry = CollectionEntry<"docs">;
type MetaEntry = CollectionEntry<"meta">;

const pages = await getCollection("docs");
const metadata = await getCollection("meta");

const staticSource: StaticSource<{
  metaData: MetaEntry["data"];
  pageData: DocsEntry["data"] & { _raw: DocsEntry };
}> = { files: [] };

for (const page of pages) {
  const virtualPath = path.relative("content/docs", page.filePath!);
  staticSource.files.push({
    type: "page",
    path: virtualPath,
    data: { ...page.data, _raw: page },
  });
}

for (const meta of metadata) {
  const virtualPath = path.relative("content/docs", meta.filePath!);
  staticSource.files.push({ type: "meta", path: virtualPath, data: meta.data });
}

export const source = loader({
  source: staticSource,
  baseUrl: "/docs",
  plugins: [
    {
      name: "trailing-slash-urls",
      config(config) {
        config.url = (slugs) => `${["/docs", ...slugs].join("/").replaceAll("//", "/")}/`;
      },
    },
  ],
});

export function getStructuredData(entry: DocsEntry): StructuredData {
  return structure(entry.body ?? "");
}
