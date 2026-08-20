import { Effect, Schema } from "effect";

export class WorkerRuntimeError extends Schema.TaggedError<WorkerRuntimeError>()(
  "WorkerRuntimeError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface ErrorEmitter {
  readonly on: (event: "error", listener: (error: Error) => void) => unknown;
  readonly off: (event: "error", listener: (error: Error) => void) => unknown;
}

export const waitForEmitterError = (
  emitter: ErrorEmitter,
  resource: "queue" | "worker",
): Effect.Effect<never, WorkerRuntimeError> =>
  Effect.callback<never, WorkerRuntimeError>((resume) => {
    let completed = false;
    const onError = (cause: Error) => {
      if (completed) return;
      completed = true;
      resume(Effect.fail(new WorkerRuntimeError({
        operation: `${resource} error event`,
        cause,
      })));
    };
    emitter.on("error", onError);
    return Effect.sync(() => {
      emitter.off("error", onError);
    });
  });

export function connectionFromUrl(url: URL) {
  const databasePath = url.pathname.replace(/^\//, "");
  const db = databasePath === "" ? undefined : Number(databasePath);
  if (db !== undefined && (!Number.isInteger(db) || db < 0)) {
    throw new Error("REDIS_URL database path must be a non-negative integer");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis: or rediss:");
  }
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "rediss:" ? "6380" : "6379")),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(db === undefined ? {} : { db }),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function publishingJobTemplate() {
  return {
    name: "publish-scheduled",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 100 },
      removeOnFail: { age: 604_800, count: 1_000 },
    },
  };
}

export function analyticsRetentionJobTemplate() {
  return {
    ...publishingJobTemplate(),
    name: "prune-analytics",
  };
}
