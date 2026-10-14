import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase } from "@prosewire/db/testing";
import { EmailDeliveryError } from "@prosewire/jobs/email-queue";
import * as JobRedis from "@prosewire/jobs/redis";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { ClusterWorkflowEngine } from "effect/unstable/cluster";
import { Workflow, WorkflowEngine } from "effect/unstable/workflow";
import { describe, expect, it } from "vitest";
import { WorkerDatabase } from "./database.ts";
import { hasPendingWork } from "./idle-work.ts";
import { clusterLayer, migrateWorkflowStorage } from "./workflow-storage.ts";
import {
  EmailDeliveryWorkflow,
  resumeSuspendedEmailWorkflows,
} from "./workflows.ts";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("durable worker idle predicate", () => {
  it("keeps schedules, deferred outbox, suspended workflows and queue leases active", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    if (!/(test|acceptance)/i.test(new URL(databaseUrl).pathname))
      throw new Error(
        "Worker idle integration requires an explicitly named test database",
      );
    // RC.115's SQL-Pg client does not forward URL search_path options. Its
    // workflow tables therefore need a separate database to prevent competing
    // test runners from executing each other's workflow messages.
    const admin = openDb(databaseUrl);
    const name = `test_idle_${randomUUID().replaceAll("-", "")}`;
    try {
      await admin.client.$client.query(`create database "${name}"`);
      const isolatedUrl = new URL(databaseUrl);
      isolatedUrl.pathname = `/${name}`;
      const database = await openTestDatabase(
        isolatedUrl.toString(),
        "worker_idle",
      );
      try {
        let queued = 0;
        let suspended = true;
        const engine = ClusterWorkflowEngine.layer.pipe(
          Layer.provideMerge(clusterLayer(Redacted.make(database.url))),
        );
        const runtime = ManagedRuntime.make(
          EmailDeliveryWorkflow.toLayer((job) =>
            job.outboxId.startsWith("suspended") && suspended
              ? Effect.flatMap(
                  WorkflowEngine.WorkflowInstance,
                  Workflow.suspend,
                )
              : job.outboxId === "failed"
                ? Effect.fail(
                    new EmailDeliveryError({
                      recipient: job.recipient,
                      cause: "rejected",
                    }),
                  )
                : Effect.void,
          ).pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                engine,
                Layer.succeed(WorkerDatabase.Service, {
                  client: database.client,
                }),
                Layer.mock(JobRedis.Service, {
                  send: <A>() => Effect.succeed(queued as A),
                }),
              ),
            ),
          ),
        );
        const busy = () => runtime.runPromise(hasPendingWork);
        const message = (id: string) => ({
          outboxId: id,
          recipient: "person@example.com",
          subject: "hello",
          text: "body",
          html: null,
        });
        try {
          await migrateWorkflowStorage(database.url);
          expect(await busy()).toBe(false);
          await database.client
            .insert(schema.organization)
            .values({ id: "org", name: "Test", slug: "test" });
          const [blog] = await database.client
            .insert(schema.blog)
            .values({ organizationId: "org", name: "Test", slug: "test" })
            .returning();
          if (!blog) throw new Error("Missing blog");
          const [author] = await database.client
            .insert(schema.author)
            .values({ blogId: blog.id, name: "Test", slug: "test" })
            .returning();
          if (!author) throw new Error("Missing author");
          await database.client.insert(schema.post).values({
            blogId: blog.id,
            authorId: author.id,
            title: "Future",
            slug: "future",
            status: "scheduled",
            scheduledAt: new Date("2099-01-01"),
          });
          expect(await busy()).toBe(true);
          await database.client
            .update(schema.post)
            .set({ status: "draft", scheduledAt: null });
          expect(await busy()).toBe(false);

          const [outbox] = await database.client
            .insert(schema.emailDeliveryOutbox)
            .values({
              recipient: "person@example.com",
              subject: "hello",
              text: "body",
              availableAt: new Date("2099-01-01"),
              lockedAt: new Date(),
              lockedBy: "other-process",
            })
            .returning();
          if (!outbox) throw new Error("Missing outbox");
          expect(await busy()).toBe(true);
          await database.client
            .update(schema.emailDeliveryOutbox)
            .set({ dispatchedAt: new Date(), lockedAt: null, lockedBy: null })
            .where(eq(schema.emailDeliveryOutbox.id, outbox.id));

          await runtime.runPromise(
            EmailDeliveryWorkflow.execute(message("complete")),
          );
          await runtime.runPromise(
            Effect.result(EmailDeliveryWorkflow.execute(message("failed"))),
          );
          expect(await busy()).toBe(false);
          queued = 1;
          expect(await busy()).toBe(true);
          queued = 0;
          await runtime.runPromise(
            EmailDeliveryWorkflow.execute(message("suspended"), {
              discard: true,
            }),
          );
          await runtime.runPromise(
            EmailDeliveryWorkflow.execute(message("suspended-two"), {
              discard: true,
            }),
          );
          // A missing reply and a Suspended reply both prohibit parking.
          expect(await busy()).toBe(true);
          const executionId = await runtime.runPromise(
            EmailDeliveryWorkflow.executionId(message("suspended")),
          );
          await expect
            .poll(() =>
              runtime.runPromise(EmailDeliveryWorkflow.poll(executionId)),
            )
            .toMatchObject({ value: { _tag: "Suspended" } });
          const secondExecutionId = await runtime.runPromise(
            EmailDeliveryWorkflow.executionId(message("suspended-two")),
          );
          await expect
            .poll(() =>
              runtime.runPromise(EmailDeliveryWorkflow.poll(secondExecutionId)),
            )
            .toMatchObject({ value: { _tag: "Suspended" } });
          suspended = false;
          // The idle query must not reset persisted workflow state.
          expect(await busy()).toBe(true);
          expect(
            await runtime.runPromise(EmailDeliveryWorkflow.poll(executionId)),
          ).toMatchObject({ value: { _tag: "Suspended" } });
          // Both scheduler modes repair every stranded run in one pass.
          expect(
            await runtime.runPromise(resumeSuspendedEmailWorkflows()),
          ).toBe(2);
          await expect.poll(busy).toBe(false);
        } finally {
          await runtime.dispose();
        }
      } finally {
        await database.close();
      }
    } finally {
      try {
        await admin.client.$client.query(`drop database if exists "${name}"`);
      } finally {
        await admin.close();
      }
    }
  });
});
