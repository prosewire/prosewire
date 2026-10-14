import { NodeCrypto } from "@effect/platform-node-shared";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import {
  MessageStorage,
  ShardingConfig,
  SingleRunner,
  SqlMessageStorage,
} from "effect/unstable/cluster";

const shardingConfig = {
  shardsPerGroup: 100,
  entityMessagePollInterval: "1 second",
  entityReplyPollInterval: "1 second",
} as const;

const postgresLayer = (databaseUrl: Redacted.Redacted<string>) =>
  PgClient.layer({
    url: databaseUrl,
    applicationName: "prosewire-workflows",
    maxConnections: 4,
  });

export const clusterLayer = (databaseUrl: Redacted.Redacted<string>) =>
  SingleRunner.layer({
    runnerStorage: "memory",
    shardingConfig,
  }).pipe(
    Layer.provideMerge(postgresLayer(databaseUrl)),
    Layer.provide(NodeCrypto.layer),
  );

/** Use the engine's SQL connection and schema, including its pinned table layout. */
export const listWorkflowExecutions = Effect.fn(
  "WorkflowStorage.listExecutions",
)(function* (workflowName: string, after: string) {
  const sql = yield* PgClient.PgClient;
  return yield* sql<{ entity_id: string }>`
      select distinct entity_id from cluster_messages
      where entity_type = ${`Workflow/${workflowName}`} and tag = 'run'
        and entity_id > ${after}
      order by entity_id limit 100
    `;
});

/**
 * Applies Effect's internal message-storage migrations during the one-shot
 * Prosewire migration command. The worker repeats the library's idempotent
 * migration check when it opens the workflow engine.
 */
export async function migrateWorkflowStorage(
  databaseUrl: string,
): Promise<void> {
  const storageLayer = SqlMessageStorage.layer.pipe(
    Layer.provideMerge(postgresLayer(Redacted.make(databaseUrl))),
    Layer.provide(NodeCrypto.layer),
    Layer.provide(ShardingConfig.layer(shardingConfig)),
  );
  const runtime = ManagedRuntime.make(storageLayer);
  try {
    await runtime.runPromise(MessageStorage.MessageStorage);
  } finally {
    await runtime.dispose();
  }
}
