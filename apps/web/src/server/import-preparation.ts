import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ApiImportRejected } from "@prosewire/contract";
import { postMutationFields } from "@prosewire/contract/schemas";
import type * as schema from "@prosewire/db/schema";
import { type Effect, Schema } from "effect";
import type { DashboardPostDetail, PostRevision } from "./content-models.ts";
import type { BlogId } from "./domain.ts";
import {
  type ImportCollection,
  type ImportFiles,
  importCollections,
  importRecords,
} from "./import-files.ts";
import {
  decodeImport,
  decodePublication,
  type ImportBudget,
  type ImportMedia,
  importedContent,
  importedId,
  rewriteImportedUrls,
} from "./import-models.ts";
import type { MediaImage } from "./media-image.ts";
import type { ObjectStorage } from "./object-storage.ts";

type RunEffect = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
const rejected = (item: string, message: string) =>
  new ApiImportRejected({ item, message });
export interface Prepared {
  readonly item: string;
  readonly collection: ImportCollection;
  readonly values: Record<string, unknown> & { id: string; blogId: string };
  readonly categoryIds?: ReadonlyArray<string>;
  readonly revisions?: ReadonlyArray<{
    id: string;
    postId: string;
    editorId: null;
    version: number;
    snapshot: Record<string, unknown>;
    createdAt: Date;
  }>;
  readonly variants?: ReadonlyArray<typeof schema.mediaVariant.$inferInsert>;
}
interface Targets {
  readonly files: ImportFiles;
  readonly blogId: BlogId;
  readonly sourceId: BlogId;
  readonly namespace: string;
  readonly preserveStates: boolean;
  readonly storage: ObjectStorage.Shape;
  readonly images: MediaImage.Shape;
  readonly run: RunEffect;
  readonly ids: Map<string, string>;
  readonly slugs: Set<string>;
  readonly keys: Set<string>;
  readonly urls: Map<string, string>;
  readonly mediaFiles: Map<string, string>;
  readonly revisionIds: Set<string>;
  readonly budget?: ImportBudget;
}

export async function* preparedRecords(
  files: ImportFiles,
  collection: ImportCollection,
) {
  const input = createReadStream(
    join(files.directory, `prepared-${collection}.ndjson`),
  );
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const record = JSON.parse(line) as Prepared;
      for (const name of [
        "createdAt",
        "updatedAt",
        "publishedAt",
        "scheduledAt",
        "archivedAt",
        "uploadedAt",
        "uploadExpiresAt",
      ]) {
        const value = record.values[name];
        if (typeof value === "string") record.values[name] = new Date(value);
      }
      for (const revision of record.revisions ?? [])
        revision.createdAt = new Date(revision.createdAt);
      yield record;
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
function targetId(
  targets: Targets,
  collection: ImportCollection,
  sourceId: string,
  item: string,
) {
  const destination = targets.ids.get(`${collection}:${sourceId}`);
  if (!destination)
    throw rejected(item, `Missing ${collection} relationship ${sourceId}`);
  return destination;
}
function identity(
  targets: Targets,
  collection: ImportCollection,
  sourceId: string,
  item: string,
) {
  return {
    id: targetId(targets, collection, sourceId, item),
    blogId: targets.blogId,
  };
}
function collectMediaFiles(targets: Targets) {
  for (const name of targets.files.mediaPaths) {
    const sourceId = name.split("/").at(-2);
    if (!sourceId || targets.mediaFiles.has(sourceId))
      throw rejected(name, "Duplicate original for a media asset");
    targets.mediaFiles.set(sourceId, name);
  }
}
function recordKey(collection: ImportCollection, item: string, value: unknown) {
  switch (collection) {
    case "snippets":
      return decodeImport(collection, item, value).key;
    case "redirects":
      return decodeImport(collection, item, value).fromPath;
    case "mediaAssets":
      return undefined;
    default:
      return decodeImport(collection, item, value).slug;
  }
}
function collectKey(
  targets: Targets,
  collection: ImportCollection,
  item: string,
  value: unknown,
) {
  const name = recordKey(collection, item, value);
  if (name === undefined) return;
  const valid =
    collection === "snippets"
      ? name.trim().length > 0 && name.length <= 255
      : Schema.is(postMutationFields.slug)(name);
  if (!valid)
    throw rejected(item, "Invalid slug, snippet key, or redirect path");
  const key = `${collection}:${name}`;
  if (targets.keys.has(key))
    throw rejected(item, "Duplicate slug or key in export");
  targets.keys.add(key);
  if (collection === "posts") targets.slugs.add(name);
}
function mediaExtension(
  variant: ImportMedia["variants"][number],
  item: string,
) {
  if (variant.kind !== "original") return "webp";
  const extensions: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const extension = extensions[variant.mimeType];
  if (!extension) throw rejected(item, "Unsupported original image type");
  return extension;
}
function collectMediaUrls(targets: Targets, asset: ImportMedia, item: string) {
  if (!asset.variants.some((variant) => variant.kind === "original"))
    throw rejected(item, "Ready media has no original variant");
  const kinds = new Set<string>();
  for (const variant of asset.variants) {
    if (kinds.has(variant.kind))
      throw rejected(item, "Duplicate media variant");
    kinds.add(variant.kind);
    const id = targetId(targets, "mediaAssets", asset.id, item);
    const destination = targets.storage.publicUrl(
      `publications/${targets.blogId}/media/${id}/${variant.kind}.${mediaExtension(variant, item)}`,
    );
    if (
      targets.urls.has(variant.publicUrl) &&
      targets.urls.get(variant.publicUrl) !== destination
    )
      throw rejected(item, "Ambiguous source media URL");
    targets.urls.set(variant.publicUrl, destination);
  }
}
function collectIdentity(
  targets: Targets,
  collection: ImportCollection,
  item: string,
  value: unknown,
) {
  const record = decodeImport(collection, item, value);
  const sourceBlog =
    "publicationId" in record ? record.publicationId : record.blogId;
  if (sourceBlog !== targets.sourceId)
    throw rejected(item, "Record belongs to a different source publication");
  const key = `${collection}:${record.id}`;
  if (targets.ids.has(key)) throw rejected(item, "Duplicate source identity");
  targets.ids.set(key, importedId(targets.namespace, collection, record.id));
}
async function collectTargets(targets: Targets) {
  collectMediaFiles(targets);
  for (const collection of importCollections) {
    for await (const { item, value } of importRecords(
      targets.files,
      collection,
    )) {
      collectIdentity(targets, collection, item, value);
      collectKey(targets, collection, item, value);
      if (collection === "mediaAssets")
        collectMediaUrls(targets, decodeImport(collection, item, value), item);
    }
  }
  if (targets.mediaFiles.size !== (targets.files.counts["mediaAssets"] ?? 0))
    throw rejected(
      "mediaAssets",
      "Supply exactly one exported original per ready media asset",
    );
}
function mediaCover(
  targets: Targets,
  sourceId: string | null | undefined,
  url: string | null,
  item: string,
) {
  if (!sourceId)
    return {
      coverImageAssetId: null,
      coverImageUrl: rewriteImportedUrls(url, targets.urls),
    };
  const destination = targetId(targets, "mediaAssets", sourceId, item);
  return {
    coverImageAssetId: destination,
    coverImageUrl: targets.storage.publicUrl(
      `publications/${targets.blogId}/media/${destination}/large.webp`,
    ),
  };
}
function validateEditorialFields(
  value: {
    title: string;
    slug: string;
    status: string;
    publishedAt?: Date | string | null;
    scheduledAt?: Date | string | null;
    archivedAt?: Date | string | null;
  },
  item: string,
) {
  if (
    !Schema.is(postMutationFields.title)(value.title) ||
    !Schema.is(postMutationFields.slug)(value.slug)
  )
    throw rejected(item, "Invalid post or revision title/slug");
  const timestamps: Readonly<Record<string, unknown>> = {
    draft: true,
    published: value.publishedAt,
    scheduled: value.scheduledAt,
    archived: value.archivedAt,
  };
  if (!timestamps[value.status])
    throw rejected(item, "Post or revision lifecycle timestamp is missing");
}
function validatePost(
  post: DashboardPostDetail,
  targets: Targets,
  item: string,
) {
  if (
    post.author.id !== post.authorId ||
    post.author.blogId !== targets.sourceId
  )
    throw rejected(item, "Embedded post author is inconsistent");
  if (
    post.categories.some(
      (link) =>
        link.postId !== post.id ||
        link.categoryId !== link.category.id ||
        link.category.blogId !== targets.sourceId,
    )
  )
    throw rejected(item, "Embedded post categories are inconsistent");
  validateEditorialFields(post, item);
}
async function prepareRevision(
  revision: PostRevision,
  postId: string,
  targets: Targets,
  item: string,
) {
  const snapshot = revision.snapshot;
  validateEditorialFields(snapshot, item);
  return {
    id: importedId(targets.namespace, "revisions", revision.id),
    postId,
    editorId: null,
    version: revision.version,
    createdAt: revision.createdAt,
    snapshot: {
      ...snapshot,
      authorId: targetId(targets, "authors", snapshot.authorId, item),
      ...(await importedContent(
        snapshot.contentMarkdown,
        targets.urls,
        targets.budget,
        snapshot.contentHtml,
      )),
      ...mediaCover(
        targets,
        snapshot.coverImageAssetId,
        snapshot.coverImageUrl,
        item,
      ),
      ...(snapshot.categoryIds === undefined
        ? {}
        : {
            categoryIds: snapshot.categoryIds.map((category) =>
              targetId(targets, "categories", category, item),
            ),
          }),
    },
  };
}
async function prepareRevisions(
  post: DashboardPostDetail,
  targets: Targets,
  item: string,
) {
  const versions = new Set<number>();
  const revisions: NonNullable<Prepared["revisions"]>[number][] = [];
  const postId = targetId(targets, "posts", post.id, item);
  for (const revision of post.revisions) {
    if (
      revision.postId !== post.id ||
      !Number.isInteger(revision.version) ||
      revision.version < 1 ||
      versions.has(revision.version) ||
      targets.revisionIds.has(revision.id)
    )
      throw rejected(item, "Invalid revision identity or version");
    versions.add(revision.version);
    targets.revisionIds.add(revision.id);
    revisions.push(await prepareRevision(revision, postId, targets, item));
  }
  return revisions;
}
async function preparePost(
  post: DashboardPostDetail,
  targets: Targets,
  item: string,
): Promise<Prepared> {
  validatePost(post, targets, item);
  const categories = post.categories.map((link) =>
    targetId(targets, "categories", link.categoryId, item),
  );
  if (new Set(categories).size !== categories.length)
    throw rejected(item, "Duplicate post category relationship");
  const {
    author: _author,
    categories: _categories,
    revisions: _revisions,
    ...fields
  } = post;
  return {
    item,
    collection: "posts",
    categoryIds: categories,
    revisions: await prepareRevisions(post, targets, item),
    values: {
      ...fields,
      ...identity(targets, "posts", post.id, item),
      authorId: targetId(targets, "authors", post.authorId, item),
      ...(await importedContent(
        post.contentMarkdown,
        targets.urls,
        targets.budget,
        post.contentHtml,
      )),
      ...mediaCover(targets, post.coverImageAssetId, post.coverImageUrl, item),
      status: targets.preserveStates ? post.status : "draft",
      createdById: null,
      updatedById: null,
    },
  };
}
async function imageOriginal(
  asset: ImportMedia,
  targets: Targets,
  item: string,
) {
  const path = targets.mediaFiles.get(asset.id);
  if (!path) throw rejected(item, "Media archive is missing the original");
  if (!targets.storage.configured)
    throw rejected(item, "Destination media storage is not configured");
  const original = asset.variants.find(
    (variant) => variant.kind === "original",
  );
  if (!original || original.byteSize > targets.storage.maxUploadBytes)
    throw rejected(item, "Original exceeds the destination upload limit");
  const body = await readFile(join(targets.files.directory, path));
  if (
    body.byteLength !== original.byteSize ||
    createHash("sha256").update(body).digest("hex") !== original.checksumSha256
  )
    throw rejected(
      item,
      "Original image size or checksum does not match the export",
    );
  return { original, body };
}
async function imageVariants(
  id: string,
  image: MediaImage.ProcessedImage,
  body: Uint8Array,
  targets: Targets,
) {
  const variants: NonNullable<Prepared["variants"]>[number][] = [];
  for (const generated of image.variants) {
    const bytes = generated.kind === "original" ? body : generated.body;
    const storageKey = `publications/${targets.blogId}/media/${id}/${generated.kind}.${generated.extension}`;
    await writeFile(
      join(targets.files.directory, `${id}-${generated.kind}`),
      bytes,
      { flag: "wx" },
    );
    variants.push({
      assetId: id,
      kind: generated.kind,
      storageKey,
      publicUrl: targets.storage.publicUrl(storageKey),
      mimeType: generated.mimeType,
      byteSize: bytes.byteLength,
      width: generated.width,
      height: generated.height,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return variants;
}
async function prepareMedia(
  asset: ImportMedia,
  targets: Targets,
  item: string,
): Promise<Prepared> {
  for (const reference of asset.references)
    targetId(targets, "posts", reference.postId, item);
  const { original, body } = await imageOriginal(asset, targets, item);
  let image: MediaImage.ProcessedImage;
  try {
    image = await targets.run(targets.images.process(body, original.mimeType));
  } catch {
    throw rejected(item, "Exported original is not a supported readable image");
  }
  const destination = identity(targets, "mediaAssets", asset.id, item);
  const variants = await imageVariants(destination.id, image, body, targets);
  return {
    item,
    collection: "mediaAssets",
    variants,
    values: {
      ...destination,
      originalFilename: asset.filename,
      declaredMimeType: original.mimeType,
      detectedMimeType: image.detectedMimeType,
      byteSize: body.byteLength,
      storageBytes: variants.reduce(
        (total, variant) => total + variant.byteSize,
        0,
      ),
      width: image.width,
      height: image.height,
      checksumSha256: original.checksumSha256,
      status: "ready",
      uploadStorageKey: `imports/${targets.blogId}/${destination.id}`,
      failureReason: null,
      createdById: null,
      uploadExpiresAt: asset.createdAt,
      uploadedAt: asset.uploadedAt,
      deletedAt: null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    },
  };
}
function prepareRedirect(
  targets: Targets,
  item: string,
  value: unknown,
): Prepared {
  const record = decodeImport("redirects", item, value);
  if (
    ![301, 302, 307, 308].includes(record.statusCode) ||
    !targets.slugs.has(record.toPath) ||
    targets.slugs.has(record.fromPath)
  )
    throw rejected(
      item,
      "Redirect must map a distinct old slug directly to an imported post",
    );
  return {
    item,
    collection: "redirects",
    values: { ...record, ...identity(targets, "redirects", record.id, item) },
  };
}
async function prepareRecord(
  targets: Targets,
  collection: ImportCollection,
  item: string,
  value: unknown,
): Promise<Prepared> {
  switch (collection) {
    case "authors": {
      const record = decodeImport(collection, item, value);
      return {
        item,
        collection,
        values: {
          ...record,
          ...identity(targets, collection, record.id, item),
          userId: null,
          avatarUrl: rewriteImportedUrls(
            record.avatarUrl,
            targets.urls,
            targets.budget,
          ),
        },
      };
    }
    case "categories": {
      const record = decodeImport(collection, item, value);
      return {
        item,
        collection,
        values: {
          ...record,
          ...identity(targets, collection, record.id, item),
        },
      };
    }
    case "snippets": {
      const record = decodeImport(collection, item, value);
      return {
        item,
        collection,
        values: {
          ...record,
          ...identity(targets, collection, record.id, item),
          contentMarkdown: rewriteImportedUrls(
            record.contentMarkdown,
            targets.urls,
            targets.budget,
          ),
        },
      };
    }
    case "redirects":
      return prepareRedirect(targets, item, value);
    case "posts":
      return preparePost(decodeImport(collection, item, value), targets, item);
    case "mediaAssets":
      return prepareMedia(decodeImport(collection, item, value), targets, item);
  }
}
async function writePreparedCollection(
  targets: Targets,
  collection: ImportCollection,
) {
  const output = createWriteStream(
    join(targets.files.directory, `prepared-${collection}.ndjson`),
    { flags: "wx" },
  );
  try {
    for await (const { item, value } of importRecords(
      targets.files,
      collection,
    )) {
      const record = await prepareRecord(
        {
          ...targets,
          budget: { bytes: Buffer.byteLength(JSON.stringify(value)), item },
        },
        collection,
        item,
        value,
      );
      const line = `${JSON.stringify(record)}\n`;
      if (Buffer.byteLength(line) > 8 * 1_024 * 1_024)
        throw rejected(item, "Prepared record exceeds 8 MB");
      await new Promise<void>((resolve, reject) =>
        output.write(line, (error) => (error ? reject(error) : resolve())),
      );
    }
    await new Promise<void>((resolve, reject) => {
      output.once("error", reject);
      output.end(resolve);
    });
  } finally {
    output.destroy();
  }
}
export async function prepareImport(
  files: ImportFiles,
  blogId: BlogId,
  preserveStates: boolean,
  storage: ObjectStorage.Shape,
  images: MediaImage.Shape,
  run: RunEffect,
) {
  const source = decodePublication(files.header["publication"]);
  const targets: Targets = {
    files,
    blogId,
    sourceId: source.id,
    namespace: `${blogId}:${files.fingerprint}:${preserveStates}`,
    preserveStates,
    storage,
    images,
    run,
    ids: new Map(),
    slugs: new Set(),
    keys: new Set(),
    urls: new Map(),
    mediaFiles: new Map(),
    revisionIds: new Set(),
  };
  await collectTargets(targets);
  for (const collection of importCollections)
    await writePreparedCollection(targets, collection);
}
