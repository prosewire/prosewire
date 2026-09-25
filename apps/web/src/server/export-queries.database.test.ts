import { randomUUID } from "node:crypto";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase } from "@prosewire/db/testing";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  testAuthor,
  testBlog,
  testDashboardPost,
  testDashboardPostDetail,
  testWorkspace,
} from "./content-test-fixtures.ts";
import { Database, DatabaseError, type DatabaseShape } from "./database.ts";
import { exportQueries } from "./export-queries.ts";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("paged export queries", () => {
  it("walks posts and history past page boundaries without duplicates", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL required");
    const db = await openTestDatabase(databaseUrl, "export_pages");
    try {
      await db.client.insert(schema.organization).values(testWorkspace);
      await db.client
        .insert(schema.blog)
        .values({ ...testBlog, locales: [...testBlog.locales] });
      await db.client.insert(schema.author).values(testAuthor);
      const posts = Array.from({ length: 61 }, (_, index) => ({
        ...testDashboardPost,
        id: randomUUID(),
        slug: `post-${index}`,
        scheduledAt: new Date("2027-01-01T00:00:00Z"),
        archivedAt: new Date("2026-08-20T00:00:00Z"),
        status: (["draft", "scheduled", "published", "archived"] as const)[
          index % 4
        ],
      }));
      await db.client.insert(schema.post).values(posts);
      const post = posts[0];
      const revision = testDashboardPostDetail.revisions[0];
      if (!post || !revision) throw new Error("Missing test fixture");
      await db.client.insert(schema.postRevision).values(
        Array.from({ length: 61 }, (_, index) => ({
          ...revision,
          id: randomUUID(),
          postId: post.id,
          version: index + 1,
        })),
      );
      let queries = 0;
      const execute: DatabaseShape["execute"] = (operation, evaluate) =>
        Effect.tryPromise({
          try: () => {
            queries++;
            return Promise.resolve(evaluate(db.client));
          },
          catch: (cause) => new DatabaseError({ operation, cause }),
        });
      const service = Database.of({
        client: Effect.succeed(db.client),
        execute,
      });
      const exported = exportQueries(service, testBlog.id);
      const first = await Effect.runPromise(
        Stream.runCollect(exported.posts.pipe(Stream.take(1))),
      );
      expect(first).toHaveLength(1);
      expect(queries).toBe(1);
      const all = await Effect.runPromise(Stream.runCollect(exported.posts));
      expect(all).toHaveLength(61);
      expect(new Set(all.map(({ id }) => id)).size).toBe(61);
      expect(new Set(all.map(({ status }) => status))).toEqual(
        new Set(["draft", "scheduled", "published", "archived"]),
      );
      const history = await Effect.runPromise(
        Stream.runCollect(exported.revisions(post.id)),
      );
      expect(history).toHaveLength(61);
      expect(new Set(history.map(({ version }) => version)).size).toBe(61);
    } finally {
      await db.close();
    }
  });
});
