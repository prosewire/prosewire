import { type CollectionEntry, getCollection } from "astro:content";
import path from "node:path";
import { type StructuredData, structure } from "fumadocs-core/mdx-plugins";
import { loader, type StaticSource } from "fumadocs-core/source";

type DocsEntry = CollectionEntry<"docs">;
type MetaEntry = CollectionEntry<"meta">;

const pages = await getCollection("docs");
const metadata = await getCollection("meta");

const staticSource: StaticSource<{
  metaData: MetaEntry["data"];
  pageData: DocsEntry["data"] & { _raw: DocsEntry };
}> = { files: [] };

function contentPath(entry: DocsEntry | MetaEntry): string {
  if (!entry.filePath) {
    throw new Error(`Content entry ${entry.id} does not have a file path`);
  }
  return path.relative("content/docs", entry.filePath);
}

for (const page of pages) {
  staticSource.files.push({
    type: "page",
    path: contentPath(page),
    data: { ...page.data, _raw: page },
  });
}

for (const meta of metadata) {
  staticSource.files.push({
    type: "meta",
    path: contentPath(meta),
    data: meta.data,
  });
}

export const source = loader({
  source: staticSource,
  baseUrl: "/docs",
  plugins: [
    {
      name: "trailing-slash-urls",
      config(config) {
        config.url = (slugs) =>
          `${["/docs", ...slugs].join("/").replaceAll("//", "/")}/`;
      },
    },
  ],
});

export function getStructuredData(entry: DocsEntry): StructuredData {
  return structure(entry.body ?? "");
}
