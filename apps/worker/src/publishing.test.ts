import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { eq, sql } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { PostId, PublishedPost } from "./domain.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { WorkerConfig } from "./worker-config.ts";

const databaseUrl = process.env.DATABASE_URL;
const postId = PostId.make("11111111-1111-4111-8111-111111111111");
const blogId = "22222222-2222-4222-8222-222222222222";
const authorId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-08-20T00:00:00.000Z");

describe("publishScheduledPosts", () => {
  it.effect("publishes due posts through the repository", () => {
    const expected: ReadonlyArray<PublishedPost> = [
      new PublishedPost({ id: postId, title: "Scheduled post" }),
    ];
    let requestedAt: Date | undefined;

    const repository = Layer.succeed(PublishingRepository.Service, {
      publishDue: (requested) => {
        requestedAt = requested;
        return Effect.succeed(expected);
      },
    });

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual(expected);
      expect(requestedAt).toBeInstanceOf(Date);
    }).pipe(Effect.provide(Publishing.layer.pipe(Layer.provide(repository))));
  });

  it.effect("succeeds when no scheduled posts are due", () => {
    const repository = Layer.succeed(PublishingRepository.Service, {
      publishDue: () => Effect.succeed([]),
    });

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual([]);
    }).pipe(Effect.provide(Publishing.layer.pipe(Layer.provide(repository))));
  });

  it("shares and closes one database resource across worker services", async () => {
    let opened = 0;
    let closed = 0;
    const config = Layer.succeed(WorkerConfig, {
      databaseUrl: Redacted.make("postgres://test"),
      redisUrl: Redacted.make("redis://test"),
      analyticsRetentionDays: 365,
      emailWorkerConcurrency: 4,
      smtpUrl: Option.none(),
      emailFrom: "Prosewire <prosewire@localhost>",
      environment: "test",
    });
    const database = WorkerDatabase.layerWith(() => {
      opened += 1;
      const resource = openDb("postgres://test");
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

describe.skipIf(!databaseUrl)(
  "scheduled publishing repository with PostgreSQL",
  () => {
    let testDatabase: TestDatabase;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL is required");
      testDatabase = await openTestDatabase(databaseUrl, "worker_publishing");
    });

    beforeEach(async () => {
      await testDatabase.reset();
      await testDatabase.client.insert(schema.organization).values({
        id: "workspace-1",
        name: "Studio",
        slug: "studio",
      });
      await testDatabase.client.insert(schema.blog).values({
        id: blogId,
        organizationId: "workspace-1",
        name: "Fieldnotes",
        slug: "fieldnotes",
      });
      await testDatabase.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Author",
        slug: "author",
      });
      await testDatabase.client.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Scheduled post",
        slug: "scheduled-post",
        status: "scheduled",
        scheduledAt: new Date("2026-08-19T00:00:00.000Z"),
      });
    });

    afterAll(async () => {
      await testDatabase?.close();
    });

    it.effect(
      "writes scheduled publication audits in the update transaction",
      () => {
        const repository = PublishingRepository.make(testDatabase.client);

        return Effect.gen(function* () {
          const published = yield* repository.publishDue(now);

          expect(published).toEqual([
            new PublishedPost({ id: postId, title: "Scheduled post" }),
          ]);
          const persisted = yield* Effect.promise(() =>
            testDatabase.client.query.post.findFirst({
              where: eq(schema.post.id, postId),
            }),
          );
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany(),
          );
          expect(persisted?.status).toBe("published");
          expect(persisted?.publishedAt).toEqual(now);
          expect(audits).toEqual([
            expect.objectContaining({
              organizationId: "workspace-1",
              blogId,
              action: "post.published_scheduled",
              entityId: postId,
            }),
          ]);
        });
      },
    );

    it.effect("rolls back publication when its audit write fails", () => {
      const repository = PublishingRepository.make(testDatabase.client);

      return Effect.gen(function* () {
        yield* Effect.promise(() =>
          testDatabase.client.execute(
            sql.raw(`
            create function fail_worker_audit() returns trigger
            language plpgsql as $$
            begin
              raise exception 'audit unavailable';
            end;
            $$;
            create trigger fail_worker_audit_insert
            before insert on audit_log
            for each row execute function fail_worker_audit()
          `),
          ),
        );
        const error = yield* Effect.flip(repository.publishDue(now));

        expect(error._tag).toBe("PublishingDatabaseError");
        const persisted = yield* Effect.promise(() =>
          testDatabase.client.query.post.findFirst({
            where: eq(schema.post.id, postId),
          }),
        );
        expect(persisted?.status).toBe("scheduled");
        expect(persisted?.publishedAt).toBeNull();
      });
    });
  },
);
