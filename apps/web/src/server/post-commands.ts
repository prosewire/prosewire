import { Schema } from "effect";
import {
  type ApiKeyId,
  AuthorId,
  BlogId,
  CategoryId,
  PostId,
  PostRevisionId,
  type UserId,
} from "./domain.ts";

export const PostStatus = Schema.Literals([
  "draft",
  "scheduled",
  "published",
  "archived",
]);
export type PostStatus = typeof PostStatus.Type;

export class CreatePostCommand extends Schema.Class<CreatePostCommand>(
  "Publishing.CreatePostCommand",
)({
  blogId: BlogId,
  authorId: AuthorId,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.optional(Schema.String),
  contentMarkdown: Schema.String,
  coverImageUrl: Schema.optional(Schema.NullOr(Schema.String)),
  coverImageAlt: Schema.optional(Schema.NullOr(Schema.String)),
  status: PostStatus,
  locale: Schema.optional(Schema.String),
  featured: Schema.Boolean,
  seoTitle: Schema.optional(Schema.NullOr(Schema.String)),
  seoDescription: Schema.optional(Schema.NullOr(Schema.String)),
  focusKeyword: Schema.optional(Schema.NullOr(Schema.String)),
  canonicalUrl: Schema.optional(Schema.NullOr(Schema.String)),
  scheduledAt: Schema.optional(Schema.NullOr(Schema.DateFromString)),
  categoryIds: Schema.Array(CategoryId),
}) {}

export class UpdatePostCommand extends Schema.Class<UpdatePostCommand>(
  "Publishing.UpdatePostCommand",
)({
  postId: PostId,
  blogId: BlogId,
  authorId: Schema.optional(AuthorId),
  title: Schema.optional(Schema.String),
  slug: Schema.optional(Schema.String),
  excerpt: Schema.optional(Schema.String),
  contentMarkdown: Schema.optional(Schema.String),
  coverImageUrl: Schema.optional(Schema.NullOr(Schema.String)),
  coverImageAlt: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(PostStatus),
  locale: Schema.optional(Schema.String),
  featured: Schema.optional(Schema.Boolean),
  seoTitle: Schema.optional(Schema.NullOr(Schema.String)),
  seoDescription: Schema.optional(Schema.NullOr(Schema.String)),
  focusKeyword: Schema.optional(Schema.NullOr(Schema.String)),
  canonicalUrl: Schema.optional(Schema.NullOr(Schema.String)),
  scheduledAt: Schema.optional(Schema.NullOr(Schema.DateFromString)),
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
