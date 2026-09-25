import * as schema from "@prosewire/db/schema";
import * as EmailQueue from "@prosewire/jobs/email-queue";
import * as JobRedis from "@prosewire/jobs/redis";
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import {
  ClusterSchema,
  EntityAddress,
  EntityId,
  EntityType,
  MessageStorage,
  Sharding,
} from "effect/unstable/cluster";
import { WorkflowEngine } from "effect/unstable/workflow";
import { WorkerDatabase } from "./database.ts";
import { EmailDeliveryWorkflow } from "./workflows.ts";

export class WorkflowRetentionError extends Schema.TaggedError<WorkflowRetentionError>()(
  "WorkflowRetentionError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class Service extends Context.Service<
  Service,
  {
    readonly pruneCompleted: (
      now: Date,
    ) => Effect.Effect<number, WorkflowRetentionError>;
  }
>()("@prosewire/worker/WorkflowRetention") {}

const databaseOperation = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new WorkflowRetentionError({ operation, cause }),
  }).pipe(Effect.uninterruptible);

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { client } = yield* WorkerDatabase.Service;
    const engine = yield* WorkflowEngine.WorkflowEngine;
    const storage = yield* MessageStorage.MessageStorage;
    const sharding = yield* Sharding.Sharding;
    const table = schema.emailDeliveryOutbox;
    const redis = yield* JobRedis.Service;

    const pruneRow = Effect.fn("WorkflowRetention.pruneRow")(function* (
      row: typeof table.$inferSelect,
      now: Date,
    ) {
      const executionId = yield* EmailDeliveryWorkflow.executionId({
        outboxId: row.id,
        recipient: row.recipient,
        subject: row.subject,
        text: row.text,
        html: row.html,
      });
      if (row.workflowPruneStartedAt === null) {
        const status = yield* EmailDeliveryWorkflow.poll(executionId).pipe(
          Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
        );
        if (Option.isNone(status) || status.value._tag !== "Complete")
          return false;
        // The marker records a verified terminal execution. If the process dies
        // after clearing storage, the next scan can finish without polling it.
        yield* databaseOperation("mark terminal email for cleanup", () =>
          client
            .update(table)
            .set({ workflowPruneStartedAt: now })
            .where(eq(table.id, row.id)),
        );
      }
      const queueReleased = yield* EmailQueue.forgetCompleted(
        executionId,
        row.id,
      ).pipe(
        Effect.provideService(JobRedis.Service, redis),
        Effect.mapError(
          (cause) =>
            new WorkflowRetentionError({
              operation: "clear terminal email queue identity",
              cause,
            }),
        ),
      );
      if (!queueReleased) return false;
      const entityId = EntityId.make(executionId);
      const shardGroup = Context.get(
        EmailDeliveryWorkflow.annotations,
        ClusterSchema.ShardGroup,
      )(entityId);
      // Effect RC.115 stores workflow requests and deferred results at this
      // entity address. The database regression pins this library convention.
      yield* storage
        .clearAddress(
          EntityAddress.make({
            entityType: EntityType.make(
              `Workflow/${EmailDeliveryWorkflow._tag}`,
            ),
            entityId,
            shardId: sharding.getShardId(entityId, shardGroup),
          }),
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new WorkflowRetentionError({
                operation: "clear terminal email execution",
                cause,
              }),
          ),
        );
      yield* databaseOperation("finish terminal email cleanup", () =>
        client
          .update(table)
          .set({
            recipient: "",
            subject: "",
            text: "",
            html: null,
            lastError: null,
            workflowPrunedAt: now,
          })
          .where(eq(table.id, row.id)),
      );
      return true;
    });

    const pruneCompleted = Effect.fn("WorkflowRetention.pruneCompleted")(
      function* (now: Date) {
        const before = new Date(now.getTime() - 30 * 86_400_000);
        let after: string | undefined;
        let pruned = 0;
        while (true) {
          const rows = yield* databaseOperation(
            "load expired email executions",
            () =>
              client
                .select()
                .from(table)
                .where(
                  and(
                    lt(table.dispatchedAt, before),
                    isNull(table.workflowPrunedAt),
                    after === undefined ? undefined : gt(table.id, after),
                  ),
                )
                .orderBy(asc(table.id))
                .limit(100),
          );
          if (rows.length === 0) break;
          for (const row of rows) {
            after = row.id;
            if (yield* pruneRow(row, now)) pruned += 1;
          }
        }
        return pruned;
      },
    );
    return Service.of({ pruneCompleted });
  }),
);

export * as WorkflowRetention from "./workflow-retention.js";
