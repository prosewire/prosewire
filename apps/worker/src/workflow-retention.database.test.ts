import * as schema from "@prosewire/db/schema";
import { openTestDatabase } from "@prosewire/db/testing";
import { EmailDeliveryError } from "@prosewire/jobs/email-queue";
import * as JobRedis from "@prosewire/jobs/redis";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { ClusterWorkflowEngine } from "effect/unstable/cluster";
import { Workflow, WorkflowEngine } from "effect/unstable/workflow";
import { describe, expect, it } from "vitest";
import { WorkerDatabase } from "./database.ts";
import { WorkflowRetention } from "./workflow-retention.ts";
import { clusterLayer } from "./workflow-storage.ts";
import { EmailDeliveryWorkflow } from "./workflows.ts";

const databaseUrl = process.env["DATABASE_URL"];
const now = new Date("2026-09-25T00:00:00Z");
const old = new Date("2026-08-01T00:00:00Z");

describe.skipIf(!databaseUrl)("terminal workflow retention", () => {
  it("clears terminal history, preserves live work and deduplication, and resumes interrupted cleanup", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const database = await openTestDatabase(databaseUrl, "workflow_retention");
    const ids = {
      completed: "00000000-0000-4000-8000-000000000001",
      missing: "00000000-0000-4000-8000-000000000002",
      interrupted: "00000000-0000-4000-8000-000000000003",
      recent: "00000000-0000-4000-8000-000000000004",
      running: "00000000-0000-4000-8000-000000000005",
      failed: "00000000-0000-4000-8000-000000000006",
    };
    const message = (outboxId: string) => ({
      outboxId,
      recipient: "person@example.com",
      subject: "Invitation",
      text: "private invitation",
      html: null,
    });
    const engine = ClusterWorkflowEngine.layer.pipe(
      Layer.provideMerge(clusterLayer(Redacted.make(database.url))),
    );
    let queueIdle = false;
    const infrastructure = Layer.mergeAll(
      Layer.mock(JobRedis.Service, {
        // This Redis adapter boundary returns the integer result of EVAL.
        send: <A>() => Effect.succeed((queueIdle ? 1 : 0) as A),
      }),
      engine,
      Layer.succeed(WorkerDatabase.Service, { client: database.client }),
    );
    const runtime = ManagedRuntime.make(
      Layer.merge(
        WorkflowRetention.layer,
        EmailDeliveryWorkflow.toLayer((job) =>
          job.outboxId === ids.running
            ? Effect.flatMap(WorkflowEngine.WorkflowInstance, Workflow.suspend)
            : job.outboxId === ids.failed
              ? Effect.fail(
                  new EmailDeliveryError({
                    recipient: job.recipient,
                    cause: "permanent rejection",
                  }),
                )
              : Effect.void,
        ),
      ).pipe(Layer.provideMerge(infrastructure)),
    );
    try {
      await database.client.insert(schema.emailDeliveryOutbox).values(
        Object.entries(ids).map(([kind, id]) => ({
          id,
          recipient: "person@example.com",
          subject: "Invitation",
          text: "private invitation",
          html: null,
          dispatchedAt: kind === "recent" ? now : old,
          workflowPruneStartedAt: kind === "interrupted" ? old : null,
        })),
      );
      await runtime.runPromise(
        EmailDeliveryWorkflow.execute(message(ids.completed)),
      );
      await runtime.runPromise(
        EmailDeliveryWorkflow.execute(message(ids.recent)),
      );
      await runtime.runPromise(
        EmailDeliveryWorkflow.execute(message(ids.running), { discard: true }),
      );
      await runtime.runPromise(
        Effect.result(EmailDeliveryWorkflow.execute(message(ids.failed))),
      );
      const completedId = await Effect.runPromise(
        EmailDeliveryWorkflow.executionId(message(ids.completed)),
      );
      expect(
        Option.isSome(
          await runtime.runPromise(EmailDeliveryWorkflow.poll(completedId)),
        ),
      ).toBe(true);
      expect(
        await runtime.runPromise(
          Effect.flatMap(WorkflowRetention.Service, (retention) =>
            retention.pruneCompleted(now),
          ),
        ),
      ).toBe(0);
      expect(
        Option.isSome(
          await runtime.runPromise(EmailDeliveryWorkflow.poll(completedId)),
        ),
      ).toBe(true);
      queueIdle = true;
      expect(
        await runtime.runPromise(
          Effect.flatMap(WorkflowRetention.Service, (retention) =>
            retention.pruneCompleted(now),
          ),
        ),
      ).toBe(3);
      expect(
        Option.isNone(
          await runtime.runPromise(EmailDeliveryWorkflow.poll(completedId)),
        ),
      ).toBe(true);
      const rows = await database.client
        .select()
        .from(schema.emailDeliveryOutbox);
      for (const id of [ids.completed, ids.interrupted, ids.failed]) {
        expect(rows.find((row) => row.id === id)).toMatchObject({
          recipient: "",
          subject: "",
          text: "",
          dispatchedAt: old,
          workflowPrunedAt: now,
        });
      }
      expect(rows.find((row) => row.id === ids.missing)).toMatchObject({
        recipient: "person@example.com",
        workflowPruneStartedAt: null,
        workflowPrunedAt: null,
      });
      expect(rows.find((row) => row.id === ids.running)).toMatchObject({
        workflowPruneStartedAt: null,
        workflowPrunedAt: null,
        text: "private invitation",
      });
      expect(rows.find((row) => row.id === ids.recent)).toMatchObject({
        recipient: "person@example.com",
        workflowPrunedAt: null,
      });
      expect(
        await runtime.runPromise(
          Effect.flatMap(WorkflowRetention.Service, (retention) =>
            retention.pruneCompleted(now),
          ),
        ),
      ).toBe(0);
      // A retained dispatch marker keeps cleaned entries out of the outbox claim.
      expect(
        (
          await database.client
            .select()
            .from(schema.emailDeliveryOutbox)
            .where(eq(schema.emailDeliveryOutbox.id, ids.completed))
        )[0]?.dispatchedAt,
      ).toEqual(old);
    } finally {
      await runtime.dispose();
      await database.close();
    }
  }, 15_000);
});
