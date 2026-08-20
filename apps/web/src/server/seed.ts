import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Option, Redacted } from "effect";
import { createExcerpt, renderMarkdown } from "@prosewire/core";
import * as schema from "@prosewire/db/schema";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import { promiseEffect } from "./external-effect.ts";
import { SeedConfig } from "./seed-config.ts";

const samplePosts = [
  {
    title: "Your content should outlive your website stack",
    slug: "content-should-outlive-your-website-stack",
    excerpt: "A practical case for keeping editorial content portable, searchable, and independent from the page builder around it.",
    status: "published" as const,
    featured: true,
    publishedAt: new Date("2026-08-12T09:00:00.000Z"),
    focusKeyword: "portable content",
    category: "Strategy",
    content: `## The hidden cost of a coupled blog

Your marketing site will change. The content you worked hard to publish should not need to move every time it does. **Portable content** keeps the editorial system independent from the presentation layer, while still making every article feel native to the website around it.

When a blog is coupled to a page builder, a redesign becomes a migration project. URLs drift, structured data disappears, and editorial work pauses while engineers rebuild templates.

## What portable content looks like

- One canonical content store
- Stable URLs and automatic redirects
- A rendered endpoint for fast integration
- A raw API for custom experiences
- Full exports with no proprietary lock-in

The reader should never notice this separation. They see familiar typography, navigation, and responsive behavior. The team gets a calmer publishing workflow.

## How do you integrate it?

Start with the rendered API or the tiny JavaScript embed. Move to the typed SDK when your product needs complete control. See the [integration guide](/integrate) for the available surfaces.

## Keep the exit door visible

A platform earns trust by making it easy to leave. Export posts, authors, categories, redirects, and metadata in documented formats. That freedom is the point—not an edge case.`,
  },
  {
    title: "A five-minute embedded blog integration",
    slug: "five-minute-drop-in-integration",
    excerpt: "Add a native-feeling publication to an existing site with one element and one script tag.",
    status: "published" as const,
    featured: false,
    publishedAt: new Date("2026-08-08T09:00:00.000Z"),
    focusKeyword: "embedded blog",
    category: "Engineering",
    content: `## Start with an empty container

Place a single element where the publication should appear. Prosewire renders semantic markup into that container and leaves typography decisions to your site.

## Add the loader

The loader fetches published content from the rendered endpoint. It does not use an iframe, so links, headings, and copy remain part of the page experience.

## Match the host site

Prosewire uses stable \`pw-*\` classes and a small set of CSS custom properties. Override those variables in the host site or add scoped CSS in the dashboard.

## Upgrade when you need more control

The same content is available through the raw JSON API and TypeScript SDK. A prototype can begin with copy-paste setup, then become a bespoke integration without a migration.`,
  },
  {
    title: "The editorial checklist we run before publish",
    slug: "editorial-checklist-before-publish",
    excerpt: "A compact review loop for structure, search intent, accessibility, and trustworthy authorship.",
    status: "published" as const,
    featured: false,
    publishedAt: new Date("2026-07-30T09:00:00.000Z"),
    focusKeyword: "editorial checklist",
    category: "Editorial",
    content: `## Does the opening answer the question?

Readers should understand the promise of an article within the first paragraph. Remove scene-setting that delays the useful part.

## Can a reader scan the structure?

Use descriptive section headings, short paragraphs, lists where they genuinely clarify steps, and a generated table of contents for longer posts.

## Is every asset accessible?

- Give meaningful images useful alt text
- Keep link labels specific
- Preserve a logical heading order
- Test narrow screens and keyboard navigation

## Is the author credible?

Show the author’s relevant role, experience, and a focused biography. Trust is easier to establish when readers can see who is responsible for the work.

## Is the search preview honest?

The title and description should accurately summarize the article. An SEO score is a review aid—not a substitute for editorial judgment.`,
  },
  {
    title: "Designing a content model that can travel",
    slug: "designing-a-content-model-that-can-travel",
    excerpt: "What to separate, what to keep together, and why clean exports begin with the schema.",
    status: "scheduled" as const,
    featured: false,
    publishedAt: null,
    scheduledInDays: 3,
    focusKeyword: "portable content model",
    category: "Engineering",
    content: `## Model meaning before presentation

A portable content model describes the job of each field instead of the visual component that happens to display it today.

## Keep public identity stable

Slugs, canonical URLs, and redirects deserve first-class records. They are part of the content contract.

## Export relationships too

An export is incomplete if it loses authors, categories, revisions, or reusable snippets.`,
  },
  {
    title: "Notes on a calmer publishing workflow",
    slug: "notes-on-a-calmer-publishing-workflow",
    excerpt: "Small interface decisions that help writers focus and make review status visible.",
    status: "draft" as const,
    featured: false,
    publishedAt: null,
    focusKeyword: "publishing workflow",
    category: "Editorial",
    content: `## Reduce context switching

Put the draft, search preview, and structural checks in one working view.

## Make state unambiguous

Draft, scheduled, published, and archived are distinct states. The primary action should always say what happens next.`,
  },
];

export const create = Effect.fn("Seed.create")(function* () {
  const webConfig = yield* WebConfig;
  const seedConfig = yield* SeedConfig;
  const database = yield* Database;

  const initialData = Effect.fn("Seed.initialData")(function* () {
    const now = yield* Clock.currentTimeMillis;
    let admin = yield* database.execute("seed.findAdmin", (client) =>
      client.query.user.findFirst({
        where: eq(schema.user.email, seedConfig.adminEmail),
      }),
    );
    if (!admin) {
      const userId = randomUUID();
      const password = yield* promiseEffect(
        "better-auth",
        "hashAdminPassword",
        () => hashPassword(Redacted.value(seedConfig.adminPassword)),
      );
      admin = yield* database.execute("seed.createAdmin", (client) =>
        client.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.user)
            .values({
              id: userId,
              email: seedConfig.adminEmail,
              name: "Prosewire Admin",
              role: "admin",
            })
            .returning();
          if (!created) throw new Error("Unable to create the admin user");
          await tx.insert(schema.account).values({
            id: randomUUID(),
            userId,
            accountId: userId,
            providerId: "credential",
            password,
          });
          return created;
        }),
      );
    }
    if (!admin) throw new Error("Unable to create the local admin user");
    const existingAdminId = admin.id;
    if (admin.role !== "admin") {
      const [promoted] = yield* database.execute("seed.promoteAdmin", (client) =>
        client
          .update(schema.user)
          .set({ role: "admin", updatedAt: new Date(now) })
          .where(eq(schema.user.id, existingAdminId))
          .returning(),
      );
      if (promoted) admin = promoted;
    }
    const adminId = admin.id;

    const existingBlog = yield* database.execute("seed.findBlog", (client) =>
      client.query.blog.findFirst({
        where: eq(schema.blog.slug, webConfig.defaultBlog),
      }),
    );
    if (existingBlog) {
      yield* database.execute("seed.ensureAdminMembership", (client) =>
        client
          .insert(schema.blogMember)
          .values({ blogId: existingBlog.id, userId: adminId, role: "owner" })
          .onConflictDoUpdate({
            target: [schema.blogMember.blogId, schema.blogMember.userId],
            set: { role: "owner" },
          }),
      );
      return;
    }

    const preparedPosts = yield* Effect.forEach(
      samplePosts,
      (item) =>
        promiseEffect("markdown", `seedPost.${item.slug}`, () =>
          renderMarkdown(item.content),
        ).pipe(Effect.map((contentHtml) => ({ item, contentHtml }))),
      { concurrency: "unbounded" },
    );

    yield* database.execute("seed.createInitialData", (client) =>
      client.transaction(async (tx) => {
        const [createdBlog] = await tx
          .insert(schema.blog)
          .values({
            name: "Fieldnotes",
            slug: webConfig.defaultBlog,
            description:
              "Independent notes on content, product craft, and building for the long term.",
            locale: "en",
            accentColor: "#ef6848",
          })
          .returning();
        if (!createdBlog) throw new Error("Unable to seed the demo blog");

        await tx.insert(schema.blogMember).values({
          blogId: createdBlog.id,
          userId: adminId,
          role: "owner",
        });

        const [defaultAuthor] = await tx
          .insert(schema.author)
          .values({
            blogId: createdBlog.id,
            userId: adminId,
            name: "Maya Chen",
            slug: "maya-chen",
            bio: "Product writer and systems thinker. Maya documents how small teams build durable publishing operations.",
            jobTitle: "Editor in residence",
            credentials: "10 years in editorial product design",
          })
          .returning();
        if (!defaultAuthor) throw new Error("Unable to seed the demo author");

        const categoryRows = await tx
          .insert(schema.category)
          .values([
            {
              blogId: createdBlog.id,
              name: "Strategy",
              slug: "strategy",
              description: "Content strategy and ownership.",
            },
            {
              blogId: createdBlog.id,
              name: "Engineering",
              slug: "engineering",
              description: "Integration and architecture.",
            },
            {
              blogId: createdBlog.id,
              name: "Editorial",
              slug: "editorial",
              description: "Writing and review workflows.",
            },
          ])
          .returning();

        for (const { item, contentHtml } of preparedPosts) {
          const [createdPost] = await tx
            .insert(schema.post)
            .values({
              blogId: createdBlog.id,
              authorId: defaultAuthor.id,
              title: item.title,
              slug: item.slug,
              excerpt: item.excerpt || createExcerpt(item.content),
              contentMarkdown: item.content,
              contentHtml,
              status: item.status,
              featured: item.featured,
              focusKeyword: item.focusKeyword,
              seoTitle: item.title,
              seoDescription: item.excerpt,
              publishedAt: item.publishedAt,
              scheduledAt:
                "scheduledInDays" in item
                  ? new Date(
                      now + item.scheduledInDays * 24 * 60 * 60 * 1000,
                    )
                  : null,
            })
            .returning();
          const selectedCategory = categoryRows.find(
            (row) => row.name === item.category,
          );
          if (createdPost && selectedCategory) {
            await tx.insert(schema.postCategory).values({
              postId: createdPost.id,
              categoryId: selectedCategory.id,
            });
          }
        }

        await tx.insert(schema.snippet).values({
          blogId: createdBlog.id,
          name: "Newsletter callout",
          key: "newsletter",
          contentMarkdown:
            "### Keep the useful ideas coming\n\nOne practical fieldnote, once a month.",
        });

        const configuredApiKey = Option.getOrUndefined(seedConfig.seedApiKey);
        if (configuredApiKey) {
          const token = Redacted.value(configuredApiKey);
          await tx.insert(schema.apiKey).values({
            blogId: createdBlog.id,
            name: "Provisioned API key",
            prefix: token.slice(0, 10),
            keyHash: createHash("sha256").update(token).digest("hex"),
            scopes: ["content:read", "content:write"],
          });
        }

        const publishedPosts = await tx.query.post.findMany({
          where: eq(schema.post.status, "published"),
        });
        for (const [postIndex, published] of publishedPosts.entries()) {
          const views = 11 - postIndex * 2;
          await tx.insert(schema.postView).values(
            Array.from({ length: Math.max(3, views) }, (_, index) => ({
              postId: published.id,
              referrer:
                index % 3 === 0
                  ? "https://www.google.com/"
                  : index % 3 === 1
                    ? "direct"
                    : "https://www.linkedin.com/",
              occurredAt: new Date(now - index * 28 * 60 * 60 * 1000),
            })),
          );
        }
      }),
    );
  });

  return { initialData };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Seed",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as Seed from "./seed";
