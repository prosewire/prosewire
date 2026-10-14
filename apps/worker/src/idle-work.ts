import * as schema from "@prosewire/db/schema";
import { hasOutstandingWork } from "@prosewire/jobs/email-queue";
import { eq, isNull } from "drizzle-orm";
import { Effect, Option } from "effect";
import { WorkerDatabase, WorkerDatabaseError } from "./database.ts";
import { listWorkflowExecutions } from "./workflow-storage.ts";
import { EmailDeliveryWorkflow } from "./workflows.ts";

/** Future schedules and deferred/leased outbox work keep the normal timers live. */
export const hasPendingWork = Effect.gen(function* () {
  const { client } = yield* WorkerDatabase.Service;
  const query = <A>(evaluate: () => PromiseLike<A>) =>
    Effect.tryPromise({
      try: async () => evaluate(),
      catch: (cause) =>
        new WorkerDatabaseError({ operation: "check worker idleness", cause }),
    }).pipe(Effect.uninterruptible);
  const scheduled = yield* query(() =>
    client
      .select({ id: schema.post.id })
      .from(schema.post)
      .where(eq(schema.post.status, "scheduled"))
      .limit(1),
  );
  if (scheduled.length > 0) return true;
  const pending = yield* query(() =>
    client
      .select({ id: schema.emailDeliveryOutbox.id })
      .from(schema.emailDeliveryOutbox)
      .where(isNull(schema.emailDeliveryOutbox.dispatchedAt))
      .limit(1),
  );
  if (pending.length > 0) return true;

  // Inspect the workflow engine rather than `processed`: a processed run can
  // be suspended on a durable Redis deferred, and still need a consumer.
  // This also finds accepted executions not yet marked dispatched in the outbox.
  let after = "";
  while (true) {
    const rows = yield* listWorkflowExecutions(
      EmailDeliveryWorkflow._tag,
      after,
    );
    for (const row of rows) {
      const result = yield* EmailDeliveryWorkflow.poll(row.entity_id);
      if (Option.isNone(result) || result.value._tag !== "Complete")
        return true;
      after = row.entity_id;
    }
    if (rows.length < 100) break;
  }
  return yield* hasOutstandingWork();
});
