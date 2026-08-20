import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import type { Db } from "@prosewire/db/client";

import { AnalyticsRetention } from "./analytics-retention.ts";
import { PostId, PublishedPost } from "./domain.ts";
import { WorkerDatabase } from "./database.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { WorkerConfig } from "./worker-config.ts";

const postId = PostId.make("11111111-1111-4111-8111-111111111111");

describe("publishScheduledPosts", () => {
  it.effect("publishes due posts through the repository", () => {
    const expected: ReadonlyArray<PublishedPost> = [
      new PublishedPost({ id: postId, title: "Scheduled post" }),
    ];
    let requestedAt: Date | undefined;

    const repository = Layer.succeed(
      PublishingRepository.Service,
      {
        publishDue: (now) => {
          requestedAt = now;
          return Effect.succeed(expected);
        },
      },
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual(expected);
      expect(requestedAt).toBeInstanceOf(Date);
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(repository))),
    );
  });

  it.effect("succeeds when no scheduled posts are due", () => {
    const repository = Layer.succeed(
      PublishingRepository.Service,
      {
        publishDue: () => Effect.succeed([]),
      },
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual([]);
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(repository))),
    );
  });

  it("shares and closes one database resource across worker services", async () => {
    let opened = 0;
    let closed = 0;
    const config = Layer.succeed(WorkerConfig, {
      databaseUrl: Redacted.make("postgres://test"),
      analyticsRetentionDays: 365,
    });
    const database = WorkerDatabase.layerWith(() => {
      opened += 1;
      return {
        client: {} as Db,
        close: () => {
          closed += 1;
          return Promise.resolve();
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

  it.effect("writes scheduled publication audits in the update transaction", () => {
    let transactionCalls = 0;
    let audits: ReadonlyArray<Record<string, unknown>> = [];
    const updateBuilder: Record<string, unknown> = {};
    updateBuilder["set"] = () => updateBuilder;
    updateBuilder["where"] = () => updateBuilder;
    updateBuilder["returning"] = () => Promise.resolve([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Scheduled post",
        blogId: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    const tx = {
      update: () => updateBuilder,
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "22222222-2222-4222-8222-222222222222",
                organizationId: "workspace-1",
              },
            ]),
        }),
      }),
      insert: () => ({
        values: (values: ReadonlyArray<Record<string, unknown>>) => {
          audits = values;
          return Promise.resolve();
        },
      }),
    };
    const db = {
      transaction: async (evaluate: (transaction: typeof tx) => Promise<unknown>) => {
        transactionCalls += 1;
        return evaluate(tx);
      },
    } as unknown as Db;
    const repository = PublishingRepository.make(db);

    return Effect.gen(function* () {
      const published = yield* repository.publishDue(new Date("2026-08-20T00:00:00Z"));

      expect(transactionCalls).toBe(1);
      expect(published).toEqual([
        new PublishedPost({ id: postId, title: "Scheduled post" }),
      ]);
      expect(audits).toEqual([
        expect.objectContaining({
          organizationId: "workspace-1",
          blogId: "22222222-2222-4222-8222-222222222222",
          action: "post.published_scheduled",
          entityId: "11111111-1111-4111-8111-111111111111",
        }),
      ]);
    });
  });

  it.effect("fails the whole publication transaction when its audit write fails", () => {
    let committed = false;
    const updateBuilder: Record<string, unknown> = {};
    updateBuilder["set"] = () => updateBuilder;
    updateBuilder["where"] = () => updateBuilder;
    updateBuilder["returning"] = () => Promise.resolve([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Scheduled post",
        blogId: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    const tx = {
      update: () => updateBuilder,
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "22222222-2222-4222-8222-222222222222",
                organizationId: "workspace-1",
              },
            ]),
        }),
      }),
      insert: () => ({ values: () => Promise.reject(new Error("audit unavailable")) }),
    };
    const db = {
      transaction: async (evaluate: (transaction: typeof tx) => Promise<unknown>) => {
        const result = await evaluate(tx);
        committed = true;
        return result;
      },
    } as unknown as Db;
    const repository = PublishingRepository.make(db);

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        repository.publishDue(new Date("2026-08-20T00:00:00Z")),
      );

      expect(error._tag).toBe("PublishingDatabaseError");
      expect(committed).toBe(false);
    });
  });
});
