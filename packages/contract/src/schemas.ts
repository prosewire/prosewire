import { Effect, Schema } from "effect";

const withDefault = <S extends Schema.Constraint>(
  schema: S,
  value: S["Encoded"],
) => Schema.withDecodingDefaultKey(Effect.succeed(value))(schema);

const uuid = Schema.String.check(Schema.isUUID());
const isoDateTime = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  ),
);
const url = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z\d+.-]*:\/\/\S+$/i),
);
const nullable = <S extends Schema.Top>(schema: S) => Schema.NullOr(schema);

export const postStatus = Schema.Literals([
  "draft",
  "scheduled",
  "published",
  "archived",
]);

export const authorOutput = Schema.Struct({
  id: uuid,
  name: Schema.String,
  slug: Schema.String,
  bio: nullable(Schema.String),
  avatarUrl: nullable(Schema.String),
  jobTitle: nullable(Schema.String),
  credentials: nullable(Schema.String),
});

export const categoryOutput = Schema.Struct({
  id: uuid,
  name: Schema.String,
  slug: Schema.String,
  description: nullable(Schema.String),
});

export const postOutput = Schema.Struct({
  id: uuid,
  blogId: uuid,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.String,
  contentMarkdown: Schema.String,
  contentHtml: Schema.String,
  coverImageAssetId: nullable(uuid),
  coverImageUrl: nullable(Schema.String),
  coverImageAlt: nullable(Schema.String),
  status: postStatus,
  locale: Schema.String,
  featured: Schema.Boolean,
  seoTitle: nullable(Schema.String),
  seoDescription: nullable(Schema.String),
  focusKeyword: nullable(Schema.String),
  canonicalUrl: nullable(Schema.String),
  publishedAt: nullable(isoDateTime),
  scheduledAt: nullable(isoDateTime),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  author: authorOutput,
  categories: Schema.Array(categoryOutput),
});

export const postRevisionSnapshot = Schema.Struct({
  authorId: uuid,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.String,
  contentMarkdown: Schema.String,
  coverImageAssetId: Schema.optionalKey(nullable(uuid)),
  coverImageUrl: nullable(Schema.String),
  coverImageAlt: nullable(Schema.String),
  status: postStatus,
  locale: Schema.String,
  featured: Schema.Boolean,
  seoTitle: nullable(Schema.String),
  seoDescription: nullable(Schema.String),
  focusKeyword: nullable(Schema.String),
  canonicalUrl: nullable(Schema.String),
  scheduledAt: nullable(isoDateTime),
  publishedAt: nullable(isoDateTime),
  archivedAt: nullable(isoDateTime),
  categoryIds: nullable(Schema.Array(uuid)),
});

export const postRevisionOutput = Schema.Struct({
  id: uuid,
  postId: uuid,
  editorId: nullable(Schema.String),
  version: Schema.Int,
  snapshot: postRevisionSnapshot,
  createdAt: isoDateTime,
});

const authorId = uuid;
const title = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(180)),
);
const slug = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(120),
    Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ),
);
const excerpt = Schema.String.check(Schema.isMaxLength(500));
const contentMarkdown = Schema.String;
const coverImageAssetId = nullable(uuid);
const coverImageUrl = nullable(url);
const coverImageAlt = nullable(Schema.String.check(Schema.isMaxLength(180)));
const locale = Schema.String.check(
  Schema.isMinLength(2),
  Schema.isMaxLength(10),
);
const featured = Schema.Boolean;
const seoTitle = nullable(Schema.String.check(Schema.isMaxLength(70)));
const seoDescription = nullable(Schema.String.check(Schema.isMaxLength(180)));
const focusKeyword = nullable(Schema.String.check(Schema.isMaxLength(120)));
const canonicalUrl = nullable(url);
const scheduledAt = nullable(isoDateTime);
const categoryIds = Schema.Array(uuid);

export const postCreateInput = Schema.Struct({
  blogId: uuid,
  authorId,
  title,
  slug,
  excerpt: Schema.optionalKey(excerpt),
  contentMarkdown: withDefault(contentMarkdown, ""),
  coverImageAssetId: Schema.optionalKey(coverImageAssetId),
  coverImageUrl: Schema.optionalKey(coverImageUrl),
  coverImageAlt: Schema.optionalKey(coverImageAlt),
  status: withDefault(postStatus, "draft"),
  locale: Schema.optionalKey(locale),
  featured: withDefault(featured, false),
  seoTitle: Schema.optionalKey(seoTitle),
  seoDescription: Schema.optionalKey(seoDescription),
  focusKeyword: Schema.optionalKey(focusKeyword),
  canonicalUrl: Schema.optionalKey(canonicalUrl),
  scheduledAt: Schema.optionalKey(scheduledAt),
  categoryIds: withDefault(categoryIds, []),
});

export const postUpdateInput = Schema.Struct({
  authorId: Schema.optionalKey(authorId),
  title: Schema.optionalKey(title),
  slug: Schema.optionalKey(slug),
  excerpt: Schema.optionalKey(excerpt),
  contentMarkdown: Schema.optionalKey(contentMarkdown),
  coverImageAssetId: Schema.optionalKey(coverImageAssetId),
  coverImageUrl: Schema.optionalKey(coverImageUrl),
  coverImageAlt: Schema.optionalKey(coverImageAlt),
  status: Schema.optionalKey(postStatus),
  locale: Schema.optionalKey(locale),
  featured: Schema.optionalKey(featured),
  seoTitle: Schema.optionalKey(seoTitle),
  seoDescription: Schema.optionalKey(seoDescription),
  focusKeyword: Schema.optionalKey(focusKeyword),
  canonicalUrl: Schema.optionalKey(canonicalUrl),
  scheduledAt: Schema.optionalKey(scheduledAt),
  categoryIds: Schema.optionalKey(categoryIds),
});

export const blogOutput = Schema.Struct({
  id: uuid,
  name: Schema.String,
  slug: Schema.String,
  description: Schema.String,
  locale: Schema.String,
  locales: Schema.Array(Schema.String),
  accentColor: Schema.String,
  customCss: Schema.String,
  publicUrl: nullable(Schema.String),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const publicBlogOutput = Schema.Struct({
  id: uuid,
  name: Schema.String,
  slug: Schema.String,
  description: Schema.String,
  locale: Schema.String,
  accentColor: Schema.String,
  publicUrl: nullable(Schema.String),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const publicPostOutput = Schema.Struct({
  id: uuid,
  slug: Schema.String,
  title: Schema.String,
  excerpt: Schema.String,
  contentMarkdown: Schema.String,
  contentHtml: Schema.String,
  coverImageUrl: nullable(Schema.String),
  coverImageAlt: nullable(Schema.String),
  status: postStatus,
  locale: Schema.String,
  featured: Schema.Boolean,
  publishedAt: nullable(isoDateTime),
  updatedAt: isoDateTime,
  readingMinutes: Schema.Finite,
  seoTitle: nullable(Schema.String),
  seoDescription: nullable(Schema.String),
  canonicalUrl: nullable(Schema.String),
  author: authorOutput,
  categories: Schema.Array(categoryOutput),
});

export const publicPostPage = Schema.Struct({
  blog: publicBlogOutput,
  posts: Schema.Array(publicPostOutput),
  categories: Schema.Array(categoryOutput),
  pagination: Schema.Struct({
    page: Schema.Int,
    pageSize: Schema.Int,
    hasMore: Schema.Boolean,
  }),
});

export const publicPostResult = Schema.Struct({
  blog: publicBlogOutput,
  post: publicPostOutput,
});

export const publicRedirectOutput = Schema.Struct({
  fromPath: Schema.String,
  toPath: Schema.String,
  statusCode: Schema.Literals([301, 302, 307, 308]),
});

export const paginatedPosts = Schema.Struct({
  items: Schema.Array(postOutput),
  total: Schema.Int,
  page: Schema.Int,
  pageSize: Schema.Int,
});

export const mediaAssetStatus = Schema.Literals([
  "pending",
  "processing",
  "ready",
  "failed",
  "deleted",
]);

export const mediaVariantOutput = Schema.Struct({
  kind: Schema.Literals(["original", "large", "thumbnail"]),
  url,
  mimeType: Schema.String,
  byteSize: Schema.Int,
  width: Schema.Int,
  height: Schema.Int,
  checksumSha256: Schema.String,
});

export const mediaReferenceOutput = Schema.Struct({
  postId: uuid,
  title: Schema.String,
  slug: Schema.String,
});

export const mediaAssetOutput = Schema.Struct({
  id: uuid,
  blogId: uuid,
  filename: Schema.String,
  mimeType: Schema.String,
  byteSize: Schema.Int,
  storageBytes: Schema.Int,
  width: nullable(Schema.Int),
  height: nullable(Schema.Int),
  checksumSha256: nullable(Schema.String),
  status: mediaAssetStatus,
  url: nullable(url),
  variants: Schema.Array(mediaVariantOutput),
  references: Schema.Array(mediaReferenceOutput),
  uploadedAt: nullable(isoDateTime),
  backedUpAt: nullable(isoDateTime),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const mediaUsageOutput = Schema.Struct({
  usedBytes: Schema.Int,
  quotaBytes: Schema.Int,
  remainingBytes: Schema.Int,
});

export const mediaListOutput = Schema.Struct({
  items: Schema.Array(mediaAssetOutput),
  usage: mediaUsageOutput,
  configured: Schema.Boolean,
  backupConfigured: Schema.Boolean,
  maxUploadBytes: Schema.Int,
});

export const mediaStartUploadInput = Schema.Struct({
  blogId: uuid,
  filename: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  mimeType: Schema.String,
  byteSize: Schema.Int.check(Schema.isGreaterThan(0)),
});

export const mediaUploadReservationOutput = Schema.Struct({
  asset: mediaAssetOutput,
  upload: Schema.Struct({
    url,
    method: Schema.Literal("PUT"),
    headers: Schema.Record(Schema.String, Schema.String),
    expiresAt: isoDateTime,
  }),
  usage: mediaUsageOutput,
});

export type PostStatus = typeof postStatus.Type;
export type Post = typeof postOutput.Type;
export type PostRevision = typeof postRevisionOutput.Type;
export type PostRevisionSnapshot = typeof postRevisionSnapshot.Type;
export type Blog = typeof blogOutput.Type;
export type PublicBlog = typeof publicBlogOutput.Type;
export type PublicAuthor = typeof authorOutput.Type;
export type PublicCategory = typeof categoryOutput.Type;
export type PublicPost = typeof publicPostOutput.Type;
export type PublicPostPage = typeof publicPostPage.Type;
export type PublicPostResult = typeof publicPostResult.Type;
export type PublicRedirect = typeof publicRedirectOutput.Type;
export type PostCreateInput = typeof postCreateInput.Type;
export type PostCreateEncodedInput = typeof postCreateInput.Encoded;
export type PostUpdateInput = typeof postUpdateInput.Type;
export type PostUpdateEncodedInput = typeof postUpdateInput.Encoded;
export type PaginatedPosts = typeof paginatedPosts.Type;
export type MediaAssetStatus = typeof mediaAssetStatus.Type;
export type MediaVariant = typeof mediaVariantOutput.Type;
export type MediaReference = typeof mediaReferenceOutput.Type;
export type MediaAsset = typeof mediaAssetOutput.Type;
export type MediaUsage = typeof mediaUsageOutput.Type;
export type MediaList = typeof mediaListOutput.Type;
export type MediaStartUploadInput = typeof mediaStartUploadInput.Type;
export type MediaUploadReservation = typeof mediaUploadReservationOutput.Type;
