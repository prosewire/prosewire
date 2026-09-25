import {
  isoDateTime,
  postMutationFields,
  postStatus,
} from "@prosewire/contract/schemas";
import { Effect, Schema } from "effect";
import {
  type ApiKeyId,
  AuthorId,
  BlogId,
  CategoryId,
  MediaAssetId,
  PostId,
  PostRevisionId,
  type UserId,
} from "./domain.ts";
import { InvalidPostRevision } from "./post-errors.ts";

export const PostStatus = postStatus;
export type PostStatus = typeof PostStatus.Type;

export class CreatePostCommand extends Schema.Class<CreatePostCommand>(
  "Publishing.CreatePostCommand",
)({
  blogId: BlogId,
  authorId: AuthorId,
  title: postMutationFields.title,
  slug: postMutationFields.slug,
  excerpt: Schema.optional(postMutationFields.excerpt),
  contentMarkdown: postMutationFields.contentMarkdown,
  coverImageAssetId: Schema.optional(Schema.NullOr(MediaAssetId)),
  coverImageUrl: Schema.optional(postMutationFields.coverImageUrl),
  coverImageAlt: Schema.optional(postMutationFields.coverImageAlt),
  status: PostStatus,
  locale: Schema.optional(postMutationFields.locale),
  featured: Schema.Boolean,
  seoTitle: Schema.optional(postMutationFields.seoTitle),
  seoDescription: Schema.optional(postMutationFields.seoDescription),
  focusKeyword: Schema.optional(postMutationFields.focusKeyword),
  canonicalUrl: Schema.optional(postMutationFields.canonicalUrl),
  scheduledAt: Schema.optional(
    Schema.NullOr(isoDateTime.pipe(Schema.decodeTo(Schema.DateFromString))),
  ),
  categoryIds: Schema.Array(CategoryId),
}) {}

export class UpdatePostCommand extends Schema.Class<UpdatePostCommand>(
  "Publishing.UpdatePostCommand",
)({
  postId: PostId,
  blogId: BlogId,
  authorId: Schema.optional(AuthorId),
  title: Schema.optional(postMutationFields.title),
  slug: Schema.optional(postMutationFields.slug),
  excerpt: Schema.optional(postMutationFields.excerpt),
  contentMarkdown: Schema.optional(postMutationFields.contentMarkdown),
  coverImageAssetId: Schema.optional(Schema.NullOr(MediaAssetId)),
  coverImageUrl: Schema.optional(postMutationFields.coverImageUrl),
  coverImageAlt: Schema.optional(postMutationFields.coverImageAlt),
  status: Schema.optional(PostStatus),
  locale: Schema.optional(postMutationFields.locale),
  featured: Schema.optional(Schema.Boolean),
  seoTitle: Schema.optional(postMutationFields.seoTitle),
  seoDescription: Schema.optional(postMutationFields.seoDescription),
  focusKeyword: Schema.optional(postMutationFields.focusKeyword),
  canonicalUrl: Schema.optional(postMutationFields.canonicalUrl),
  scheduledAt: Schema.optional(
    Schema.NullOr(isoDateTime.pipe(Schema.decodeTo(Schema.DateFromString))),
  ),
  categoryIds: Schema.optional(Schema.Array(CategoryId)),
}) {}

export class ArchivePostsCommand extends Schema.Class<ArchivePostsCommand>(
  "Publishing.ArchivePostsCommand",
)({
  blogId: BlogId,
  postIds: Schema.Array(PostId),
  requireAll: Schema.Boolean,
}) {}

export const PostRevisionSnapshot = Schema.Struct({
  authorId: AuthorId,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.String,
  contentMarkdown: Schema.String,
  contentHtml: Schema.String,
  coverImageAssetId: Schema.optional(Schema.NullOr(MediaAssetId)),
  coverImageUrl: Schema.NullOr(Schema.String),
  coverImageAlt: Schema.NullOr(Schema.String),
  status: PostStatus,
  locale: Schema.String,
  featured: Schema.Boolean,
  seoTitle: Schema.NullOr(Schema.String),
  seoDescription: Schema.NullOr(Schema.String),
  focusKeyword: Schema.NullOr(Schema.String),
  canonicalUrl: Schema.NullOr(Schema.String),
  scheduledAt: Schema.NullOr(Schema.DateFromString),
  publishedAt: Schema.NullOr(Schema.DateFromString),
  archivedAt: Schema.NullOr(Schema.DateFromString),
  categoryIds: Schema.optional(Schema.Array(CategoryId)),
});
export type PostRevisionSnapshot = typeof PostRevisionSnapshot.Type;

export const decodeRevisionSnapshot = (
  revisionId: PostRevisionId,
  snapshot: unknown,
) =>
  Schema.decodeUnknownEffect(PostRevisionSnapshot)(snapshot).pipe(
    Effect.mapError(
      () =>
        new InvalidPostRevision({
          revisionId,
          message: "The saved revision contains invalid content",
        }),
    ),
  );

export class RestorePostRevisionCommand extends Schema.Class<RestorePostRevisionCommand>(
  "Publishing.RestorePostRevisionCommand",
)({
  blogId: BlogId,
  postId: PostId,
  revisionId: PostRevisionId,
}) {}

export type Actor =
  | {
      readonly _tag: "Dashboard";
      readonly userId: UserId;
    }
  | {
      readonly _tag: "Api";
      readonly keyId: ApiKeyId;
    };

export interface MutationResult {
  readonly postId: PostId;
  readonly blogSlug: string;
}

export interface ArchiveResult {
  readonly archived: number;
  readonly blogSlug: string;
}
