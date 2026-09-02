import {
  Author,
  Blog,
  Category,
  DashboardPost,
  DashboardPostDetail,
  PostCategory,
  PostRevision,
  PublicPost,
  Redirect,
  Snippet,
  Workspace,
} from "./content-models.ts";
import {
  AuthorId,
  BlogId,
  BlogSlug,
  CategoryId,
  MemberId,
  OrganizationId,
  OrganizationSlug,
  PostId,
  PostRevisionId,
  RedirectId,
  SnippetId,
} from "./domain.ts";

const timestamp = new Date("2026-08-20T00:00:00.000Z");

export const testBlogId = BlogId.make("11111111-1111-4111-8111-111111111111");
export const testPostId = PostId.make("22222222-2222-4222-8222-222222222222");
export const testAuthorId = AuthorId.make(
  "33333333-3333-4333-8333-333333333333",
);

export const testWorkspace = new Workspace({
  id: OrganizationId.make("workspace-1"),
  name: "Test workspace",
  slug: OrganizationSlug.make("test-workspace"),
  logo: null,
  metadata: null,
  createdAt: timestamp,
});

export const testBlog = new Blog({
  id: testBlogId,
  organizationId: testWorkspace.id,
  name: "Field Notes",
  slug: BlogSlug.make("fieldnotes"),
  description: "Portable publishing",
  locale: "en",
  locales: ["en"],
  accentColor: "#ef6848",
  customCss: "",
  publicUrl: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const testAuthor = new Author({
  id: testAuthorId,
  blogId: testBlogId,
  name: "Ada",
  slug: "ada",
  bio: null,
  avatarUrl: null,
  jobTitle: null,
  credentials: null,
  userId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const testCategory = new Category({
  id: CategoryId.make("44444444-4444-4444-8444-444444444444"),
  blogId: testBlogId,
  name: "Engineering",
  slug: "engineering",
  description: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const testPostCategory = new PostCategory({
  postId: testPostId,
  categoryId: testCategory.id,
  category: testCategory,
});

const postFields = {
  id: testPostId,
  blogId: testBlogId,
  authorId: testAuthorId,
  title: "=IMPORTXML unsafe title",
  slug: "effect-properly",
  excerpt: "A useful post",
  contentMarkdown: "# Effect",
  contentHtml: "<h1>Effect</h1>",
  coverImageAssetId: null,
  coverImageUrl: null,
  coverImageAlt: null,
  status: "published" as const,
  locale: "en",
  featured: false,
  seoTitle: null,
  seoDescription: null,
  focusKeyword: null,
  canonicalUrl: null,
  scheduledAt: null,
  publishedAt: timestamp,
  archivedAt: null,
  createdById: null,
  updatedById: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  author: testAuthor,
  categories: [testPostCategory],
};

export const testPublicPost = new PublicPost(postFields);
export const testDashboardPost = new DashboardPost({
  ...postFields,
  viewCount: 0,
});

const testRevision = new PostRevision({
  id: PostRevisionId.make("55555555-5555-4555-8555-555555555555"),
  postId: testPostId,
  editorId: null,
  version: 1,
  snapshot: {
    authorId: testAuthorId,
    title: "Earlier",
    slug: "earlier",
    excerpt: "Earlier excerpt",
    contentMarkdown: "# Earlier",
    contentHtml: "<h1>Earlier</h1>",
    coverImageAssetId: null,
    coverImageUrl: null,
    coverImageAlt: null,
    status: "draft",
    locale: "en",
    featured: false,
    seoTitle: null,
    seoDescription: null,
    focusKeyword: null,
    canonicalUrl: null,
    scheduledAt: null,
    publishedAt: null,
    archivedAt: null,
    categoryIds: [testCategory.id],
  },
  createdAt: timestamp,
});

export const testDashboardPostDetail = new DashboardPostDetail({
  ...postFields,
  title: "Effect, properly",
  revisions: [testRevision],
});

export const testSnippet = new Snippet({
  id: SnippetId.make("66666666-6666-4666-8666-666666666666"),
  blogId: testBlogId,
  name: "Call to action",
  key: "cta",
  contentMarkdown: "Read more",
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const testRedirect = new Redirect({
  id: RedirectId.make("77777777-7777-4777-8777-777777777777"),
  blogId: testBlogId,
  fromPath: "old",
  toPath: "effect-properly",
  statusCode: 308,
  createdAt: timestamp,
});

export const testMemberId = MemberId.make("member-1");
