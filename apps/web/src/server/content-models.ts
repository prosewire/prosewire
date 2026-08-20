import { Schema } from "effect";
import type * as databaseSchema from "@prosewire/db/schema";
import {
  AuthorId,
  BlogId,
  BlogSlug,
  CategoryId,
  PostId,
  PostRevisionId,
  PostViewId,
  RedirectId,
  SnippetId,
  UserId,
} from "./domain.ts";

const nullableString = Schema.NullOr(Schema.String);
const timestamps = {
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
};

export class Blog extends Schema.Class<Blog>("Content.Blog")({
  id: BlogId,
  name: Schema.String,
  slug: BlogSlug,
  description: Schema.String,
  locale: Schema.String,
  accentColor: Schema.String,
  customCss: Schema.String,
  publicUrl: nullableString,
  ...timestamps,
}) {}

export class Author extends Schema.Class<Author>("Content.Author")({
  id: AuthorId,
  blogId: BlogId,
  name: Schema.String,
  slug: Schema.String,
  bio: nullableString,
  avatarUrl: nullableString,
  jobTitle: nullableString,
  credentials: nullableString,
  userId: Schema.NullOr(UserId),
  ...timestamps,
}) {}

export class Category extends Schema.Class<Category>("Content.Category")({
  id: CategoryId,
  blogId: BlogId,
  name: Schema.String,
  slug: Schema.String,
  description: nullableString,
  ...timestamps,
}) {}

export class PostCategory extends Schema.Class<PostCategory>(
  "Content.PostCategory",
)({
  postId: PostId,
  categoryId: CategoryId,
  category: Category,
}) {}

export class PostView extends Schema.Class<PostView>("Content.PostView")({
  id: PostViewId,
  postId: PostId,
  referrer: nullableString,
  country: nullableString,
  occurredAt: Schema.Date,
}) {}

export class PostRevision extends Schema.Class<PostRevision>(
  "Content.PostRevision",
)({
  id: PostRevisionId,
  postId: PostId,
  editorId: Schema.NullOr(UserId),
  version: Schema.Number,
  snapshot: Schema.Unknown,
  createdAt: Schema.Date,
}) {}

const postFields = {
  id: PostId,
  blogId: BlogId,
  authorId: AuthorId,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.String,
  contentMarkdown: Schema.String,
  contentHtml: Schema.String,
  coverImageUrl: nullableString,
  coverImageAlt: nullableString,
  status: Schema.Literals(["draft", "scheduled", "published", "archived"]),
  locale: Schema.String,
  featured: Schema.Boolean,
  seoTitle: nullableString,
  seoDescription: nullableString,
  focusKeyword: nullableString,
  canonicalUrl: nullableString,
  scheduledAt: Schema.NullOr(Schema.Date),
  publishedAt: Schema.NullOr(Schema.Date),
  archivedAt: Schema.NullOr(Schema.Date),
  ...timestamps,
};

export class DashboardPost extends Schema.Class<DashboardPost>(
  "Content.DashboardPost",
)({
  ...postFields,
  author: Author,
  categories: Schema.Array(PostCategory),
  views: Schema.Array(PostView),
}) {}

export class DashboardPostDetail extends Schema.Class<DashboardPostDetail>(
  "Content.DashboardPostDetail",
)({
  ...postFields,
  author: Author,
  categories: Schema.Array(PostCategory),
  revisions: Schema.Array(PostRevision),
}) {}

export class PublicPost extends Schema.Class<PublicPost>("Content.PublicPost")({
  ...postFields,
  author: Author,
  categories: Schema.Array(PostCategory),
}) {}

export class Snippet extends Schema.Class<Snippet>("Content.Snippet")({
  id: SnippetId,
  blogId: BlogId,
  name: Schema.String,
  key: Schema.String,
  contentMarkdown: Schema.String,
  ...timestamps,
}) {}

export class Redirect extends Schema.Class<Redirect>("Content.Redirect")({
  id: RedirectId,
  blogId: BlogId,
  fromPath: Schema.String,
  toPath: Schema.String,
  statusCode: Schema.Number,
  createdAt: Schema.Date,
}) {}

export class TeamMember extends Schema.Class<TeamMember>("Content.TeamMember")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Literals(["owner", "admin", "editor", "author", "viewer"]),
}) {}

type BlogRow = typeof databaseSchema.blog.$inferSelect;
type AuthorRow = typeof databaseSchema.author.$inferSelect;
type CategoryRow = typeof databaseSchema.category.$inferSelect;
type PostRow = typeof databaseSchema.post.$inferSelect;
type PostCategoryRow = typeof databaseSchema.postCategory.$inferSelect & {
  readonly category: CategoryRow;
};
type PostViewRow = typeof databaseSchema.postView.$inferSelect;
type PostRevisionRow = typeof databaseSchema.postRevision.$inferSelect;

export const toBlog = (row: BlogRow) =>
  new Blog({ ...row, id: BlogId.make(row.id), slug: BlogSlug.make(row.slug) });

export const toAuthor = (row: AuthorRow) =>
  new Author({
    ...row,
    id: AuthorId.make(row.id),
    blogId: BlogId.make(row.blogId),
    userId: row.userId ? UserId.make(row.userId) : null,
  });

export const toCategory = (row: CategoryRow) =>
  new Category({
    ...row,
    id: CategoryId.make(row.id),
    blogId: BlogId.make(row.blogId),
  });

const toPostCategory = (row: PostCategoryRow) =>
  new PostCategory({
    postId: PostId.make(row.postId),
    categoryId: CategoryId.make(row.categoryId),
    category: toCategory(row.category),
  });

const toPostView = (row: PostViewRow) =>
  new PostView({
    ...row,
    id: PostViewId.make(row.id),
    postId: PostId.make(row.postId),
  });

const toPostRevision = (row: PostRevisionRow) =>
  new PostRevision({
    ...row,
    id: PostRevisionId.make(row.id),
    postId: PostId.make(row.postId),
    editorId: row.editorId ? UserId.make(row.editorId) : null,
  });

const postValues = (row: PostRow) => ({
  ...row,
  id: PostId.make(row.id),
  blogId: BlogId.make(row.blogId),
  authorId: AuthorId.make(row.authorId),
});

export const toDashboardPost = (
  row: PostRow & {
    readonly author: AuthorRow;
    readonly categories: ReadonlyArray<PostCategoryRow>;
    readonly views: ReadonlyArray<PostViewRow>;
  },
) =>
  new DashboardPost({
    ...postValues(row),
    author: toAuthor(row.author),
    categories: row.categories.map(toPostCategory),
    views: row.views.map(toPostView),
  });

export const toDashboardPostDetail = (
  row: PostRow & {
    readonly author: AuthorRow;
    readonly categories: ReadonlyArray<PostCategoryRow>;
    readonly revisions: ReadonlyArray<PostRevisionRow>;
  },
) =>
  new DashboardPostDetail({
    ...postValues(row),
    author: toAuthor(row.author),
    categories: row.categories.map(toPostCategory),
    revisions: row.revisions.map(toPostRevision),
  });

export const toPublicPost = (
  row: PostRow & {
    readonly author: AuthorRow;
    readonly categories: ReadonlyArray<PostCategoryRow>;
  },
) =>
  new PublicPost({
    ...postValues(row),
    author: toAuthor(row.author),
    categories: row.categories.map(toPostCategory),
  });

export const toSnippet = (row: typeof databaseSchema.snippet.$inferSelect) =>
  new Snippet({
    ...row,
    id: SnippetId.make(row.id),
    blogId: BlogId.make(row.blogId),
  });

export const toRedirect = (row: typeof databaseSchema.redirect.$inferSelect) =>
  new Redirect({
    ...row,
    id: RedirectId.make(row.id),
    blogId: BlogId.make(row.blogId),
  });
