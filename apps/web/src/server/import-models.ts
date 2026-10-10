import { createHash } from "node:crypto";
import { ApiImportRejected } from "@prosewire/contract";
import { renderMarkdown } from "@prosewire/core";
import { Schema } from "effect";
import {
  Author,
  Blog,
  Category,
  DashboardPostDetail,
  Redirect,
  Snippet,
} from "./content-models.ts";
import { MediaAssetId } from "./domain.ts";
import type { ImportCollection } from "./import-files.ts";

const nullable = Schema.NullOr(Schema.String);
const positive = Schema.Int.check(Schema.isGreaterThan(0));
const mediaUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        url.hostname.length > 0 &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }),
);
const checksum = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const ImportMedia = Schema.Struct({
  id: MediaAssetId,
  publicationId: Schema.String.check(Schema.isUUID()),
  filename: Schema.String,
  declaredMimeType: Schema.String,
  detectedMimeType: nullable,
  byteSize: positive,
  storageBytes: positive,
  width: Schema.NullOr(positive),
  height: Schema.NullOr(positive),
  checksumSha256: Schema.NullOr(checksum),
  status: Schema.Literal("ready"),
  uploadedAt: Schema.NullOr(Schema.DateFromString),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
  variants: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["original", "large", "thumbnail"]),
      publicUrl: mediaUrl,
      mimeType: Schema.String,
      byteSize: positive,
      width: positive,
      height: positive,
      checksumSha256: checksum,
    }),
  ),
  references: Schema.Array(
    Schema.Struct({
      postId: Schema.String.check(Schema.isUUID()),
      title: Schema.String,
      slug: Schema.String,
    }),
  ),
});
export type ImportMedia = typeof ImportMedia.Type;

export const importDecoders = {
  authors: Schema.decodeUnknownSync(Schema.toCodecJson(Author)),
  categories: Schema.decodeUnknownSync(Schema.toCodecJson(Category)),
  snippets: Schema.decodeUnknownSync(Schema.toCodecJson(Snippet)),
  redirects: Schema.decodeUnknownSync(Schema.toCodecJson(Redirect)),
  mediaAssets: Schema.decodeUnknownSync(ImportMedia),
  posts: Schema.decodeUnknownSync(Schema.toCodecJson(DashboardPostDetail)),
};
export type ImportRecord<C extends ImportCollection> = ReturnType<
  (typeof importDecoders)[C]
>;

export function decodeImport<C extends ImportCollection>(
  collection: C,
  item: string,
  value: unknown,
): ImportRecord<C> {
  try {
    return importDecoders[collection](value) as ImportRecord<C>;
  } catch {
    throw new ApiImportRejected({
      item,
      message:
        collection === "mediaAssets"
          ? "Invalid media record; only ready assets are supported"
          : "Invalid export record",
    });
  }
}
export function decodePublication(value: unknown) {
  try {
    return Schema.decodeUnknownSync(Schema.toCodecJson(Blog))(value);
  } catch {
    throw new ApiImportRejected({
      item: "publication",
      message: "Invalid source publication",
    });
  }
}

/** IDs depend on the target and exact content, never on untrusted source accounts. */
export function importedId(
  namespace: string,
  collection: string,
  sourceId: string,
) {
  const bytes = createHash("sha256")
    .update(`${namespace}:${collection}:${sourceId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ImportBudget {
  bytes: number;
  readonly item: string;
}
function requireBudget(budget: ImportBudget) {
  if (budget.bytes > 8 * 1_024 * 1_024)
    throw new ApiImportRejected({
      item: budget.item,
      message: "Rewritten content exceeds 8 MB",
    });
}
export function rewriteImportedUrls(
  value: string | null,
  urls: ReadonlyMap<string, string>,
  budget: ImportBudget = {
    bytes: Buffer.byteLength(value ?? ""),
    item: "content",
  },
) {
  if (value === null) return null;
  if (urls.size === 0) return value;
  const sources = [...urls.keys()].sort(
    (left, right) => right.length - left.length,
  );
  const pattern = new RegExp(
    sources.map((url) => url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g",
  );
  return value.replace(pattern, (source) => {
    const destination = urls.get(source) ?? source;
    budget.bytes += Buffer.byteLength(destination) - Buffer.byteLength(source);
    requireBudget(budget);
    return destination;
  });
}
export async function importedContent(
  markdown: string,
  urls: ReadonlyMap<string, string>,
  budget?: ImportBudget,
  previousHtml?: string,
) {
  const before = budget?.bytes ?? 0;
  const contentMarkdown = rewriteImportedUrls(markdown, urls, budget) ?? "";
  const contentHtml = await renderMarkdown(contentMarkdown);
  if (budget) {
    budget.bytes =
      before +
      Buffer.byteLength(JSON.stringify({ contentMarkdown, contentHtml })) -
      Buffer.byteLength(
        JSON.stringify({
          contentMarkdown: markdown,
          ...(previousHtml === undefined ? {} : { contentHtml: previousHtml }),
        }),
      );
    requireBudget(budget);
  }
  return { contentMarkdown, contentHtml };
}
