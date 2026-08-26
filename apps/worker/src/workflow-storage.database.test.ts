import { openTestDatabase } from "@prosewire/db/testing";
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect";
import { ClusterWorkflowEngine } from "effect/unstable/cluster";
import { Workflow } from "effect/unstable/workflow";
import { describe, expect, it } from "vitest";
import { clusterLayer, migrateWorkflowStorage } from "./workflow-storage.ts";

const databaseUrl = process.env["DATABASE_URL"];

const PersistenceWorkflow = Workflow.make("PersistenceWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id,
});

const runtimeFor = (url: string, value: string, executed: Array<string>) => {
  const engineLayer = ClusterWorkflowEngine.layer.pipe(
    Layer.provideMerge(clusterLayer(Redacted.make(url))),
  );
  const handlerLayer = PersistenceWorkflow.toLayer(({ id }) =>
    Effect.sync(() => {
      executed.push(id);
      return value;
    }),
  ).pipe(Layer.provideMerge(engineLayer));
  return ManagedRuntime.make(handlerLayer);
};

describe.skipIf(!databaseUrl)("PostgreSQL workflow storage", () => {
  it("replays a completed workflow result after the worker restarts", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const database = await openTestDatabase(databaseUrl, "worker_workflows");
    const firstExecutions: Array<string> = [];
    const secondExecutions: Array<string> = [];

    try {
      await migrateWorkflowStorage(database.url);
      const firstRuntime = runtimeFor(
        database.url,
        "first result",
        firstExecutions,
      );
      try {
        expect(
          await firstRuntime.runPromise(
            PersistenceWorkflow.execute({ id: "execution-1" }),
          ),
        ).toBe("first result");
      } finally {
        await firstRuntime.dispose();
      }

      const secondRuntime = runtimeFor(
        database.url,
        "second result",
        secondExecutions,
      );
      try {
        expect(
          await secondRuntime.runPromise(
            PersistenceWorkflow.execute({ id: "execution-1" }),
          ),
        ).toBe("first result");
      } finally {
        await secondRuntime.dispose();
      }

      expect(firstExecutions).toEqual(["execution-1"]);
      expect(secondExecutions).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
