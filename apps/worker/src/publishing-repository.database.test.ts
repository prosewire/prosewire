import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { PostId, PublishedPost } from "./domain.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { WorkerConfig } from "./worker-config.ts";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("PostgreSQL scheduled publishing", () => {
  it("publishes only due posts and writes their audits in the transaction", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = `workspace-${randomUUID()}`;
    const blogId = randomUUID();
    const authorId = randomUUID();
    const duePostId = randomUUID();
    const futurePostId = randomUUID();
    const draftPostId = randomUUID();
    const now = new Date("2030-01-01T12:00:00.000Z");

    try {
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Scheduled publishing",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Scheduled publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Scheduler",
        slug: `author-${randomUUID()}`,
      });
      await resource.client.insert(schema.post).values([
        {
          id: duePostId,
          blogId,
          authorId,
          title: "Due post",
          slug: "due-post",
          status: "scheduled",
          scheduledAt: new Date("2029-12-31T12:00:00.000Z"),
        },
        {
          id: futurePostId,
          blogId,
          authorId,
          title: "Future post",
          slug: "future-post",
          status: "scheduled",
          scheduledAt: new Date("2030-01-02T12:00:00.000Z"),
        },
        {
          id: draftPostId,
          blogId,
          authorId,
          title: "Draft post",
          slug: "draft-post",
          status: "draft",
        },
      ]);

      const repository = PublishingRepository.make(resource.client);
      const published = await Effect.runPromise(repository.publishDue(now));
      const posts = await resource.client
        .select({
          id: schema.post.id,
          status: schema.post.status,
          publishedAt: schema.post.publishedAt,
        })
        .from(schema.post)
        .where(inArray(schema.post.id, [duePostId, futurePostId, draftPostId]));
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.blogId, blogId),
      });
      const byId = new Map(posts.map((post) => [post.id, post]));

      expect(published).toEqual([
        new PublishedPost({ id: PostId.make(duePostId), title: "Due post" }),
      ]);
      expect(byId.get(duePostId)).toMatchObject({
        status: "published",
        publishedAt: now,
      });
      expect(byId.get(futurePostId)).toMatchObject({
        status: "scheduled",
        publishedAt: null,
      });
      expect(byId.get(draftPostId)).toMatchObject({
        status: "draft",
        publishedAt: null,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        organizationId,
        blogId,
        action: "post.published_scheduled",
        entityId: duePostId,
      });
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.blogId, blogId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.close();
    }
  });

  it("rolls back scheduled publication when its audit insert fails", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = `workspace-${randomUUID()}`;
    const blogId = randomUUID();
    const authorId = randomUUID();
    const postId = randomUUID();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `reject_scheduled_audit_${suffix}`;
    const triggerName = `reject_scheduled_audit_${suffix}`;
    const now = new Date("2030-01-01T12:00:00.000Z");

    try {
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Rollback workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Rollback publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Scheduler",
        slug: `author-${randomUUID()}`,
      });
      await resource.client.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Rollback post",
        slug: "rollback-post",
        status: "scheduled",
        scheduledAt: new Date("2029-12-31T12:00:00.000Z"),
      });
      await resource.client.$client.query(`
        create function "${functionName}"() returns trigger
        language plpgsql as $$
        begin
          if new.entity_id = tg_argv[0] then
            raise exception 'forced audit failure';
          end if;
          return new;
        end
        $$
      `);
      await resource.client.$client.query(`
        create trigger "${triggerName}"
        before insert on audit_log
        for each row execute function "${functionName}"('${postId}')
      `);

      const repository = PublishingRepository.make(resource.client);
      const failure = await Effect.runPromise(
        Effect.flip(repository.publishDue(now)),
      );
      const persisted = await resource.client.query.post.findFirst({
        where: eq(schema.post.id, postId),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.entityId, postId),
      });

      expect(failure).toMatchObject({
        _tag: "PublishingDatabaseError",
        operation: "publish due posts",
      });
      expect(persisted).toMatchObject({
        status: "scheduled",
        publishedAt: null,
      });
      expect(audits).toEqual([]);
    } finally {
      await resource.client.$client.query(
        `drop trigger if exists "${triggerName}" on audit_log`,
      );
      await resource.client.$client.query(
        `drop function if exists "${functionName}"()`,
      );
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.blogId, blogId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.close();
    }
  });

  it("shares and closes one real database resource across worker services", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    let opened = 0;
    let closed = 0;
    const config = Layer.succeed(WorkerConfig, {
      databaseUrl: Redacted.make(databaseUrl),
      redisUrl: Redacted.make("redis://test"),
      analyticsRetentionDays: 365,
      emailWorkerConcurrency: 4,
      smtpUrl: Option.none(),
      emailFrom: "Prosewire <prosewire@localhost>",
      environment: "test",
    });
    const database = WorkerDatabase.layerWith((url) => {
      opened += 1;
      const resource = openDb(url);
      return {
        client: resource.client,
        close: async () => {
          closed += 1;
          await resource.close();
        },
      };
    }).pipe(Layer.provideMerge(config));
    const repository = PublishingRepository.layer.pipe(
      Layer.provideMerge(database),
    );
    const retention = AnalyticsRetention.layer.pipe(
      Layer.provideMerge(database),
    );
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(database, repository, retention),
    );

    try {
      await runtime.runPromise(
        Effect.all([
          WorkerDatabase.Service,
          PublishingRepository.Service,
          AnalyticsRetention.Service,
        ]),
      );
      expect(opened).toBe(1);
      expect(closed).toBe(0);
    } finally {
      await runtime.dispose();
    }

    expect(closed).toBe(1);
  });
});
