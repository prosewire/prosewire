import { setTimeout } from "node:timers/promises";
import { Effect, Schema } from "effect";

class WorkerWakeError extends Schema.TaggedError<WorkerWakeError>()(
  "WorkerWakeError",
  { cause: Schema.Defect() },
) {}

class WorkerWakeConfigurationError extends Error {
  override readonly name = "WorkerWakeConfigurationError";
}

/** Optional post-commit hint. Postgres and the workflow queue remain authoritative. */
function parseWakeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new WorkerWakeConfigurationError("Invalid PROSEWIRE_WORKER_WAKE_URL");
  }
}

function wakeEndpoint() {
  const url = process.env["PROSEWIRE_WORKER_WAKE_URL"];
  if (!url) return undefined;
  const token = process.env["PROSEWIRE_WORKER_WAKE_TOKEN"];
  if (!token || token.length < 32)
    throw new WorkerWakeConfigurationError(
      "PROSEWIRE_WORKER_WAKE_TOKEN must contain at least 32 characters",
    );
  const endpoint = parseWakeUrl(url);
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  )
    throw new WorkerWakeConfigurationError(
      "Worker wake URL must be an HTTP endpoint without embedded credentials",
    );
  return { endpoint, token };
}

async function attemptWake(
  config: NonNullable<ReturnType<typeof wakeEndpoint>>,
  timeout: number,
) {
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

const transientStatuses = new Set([0, 429, 502, 503, 504]);

export async function requestWorkerWake() {
  const config = wakeEndpoint();
  if (!config) return;
  const deadline = Date.now() + 60_000;
  let delay = 500;
  while (Date.now() < deadline) {
    const status = await attemptWake(
      config,
      Math.min(10_000, deadline - Date.now()),
    );
    if (status === 202) return;
    if (!transientStatuses.has(status))
      throw new Error(`Worker wake rejected with HTTP ${status}`);
    await setTimeout(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 2, 5_000);
  }
  // Do not log URLs, bearer tokens, or fetch errors containing them.
  throw new Error("Worker wake was not accepted within 60 seconds");
}

const wakeRequest = Effect.tryPromise({
  try: requestWorkerWake,
  catch: (cause) => new WorkerWakeError({ cause }),
}).pipe(
  Effect.tapError((error) =>
    Effect.logError(
      error.cause instanceof WorkerWakeConfigurationError
        ? `Worker wake configuration error: ${error.cause.message}`
        : "Post-commit worker wake failed; durable work is preserved and requires the configured recovery wake",
    ),
  ),
  Effect.ignore,
);

// The durable commit is awaited by its caller. This bounded, observed hint
// carries no scoped database services and must survive the request fiber.
export const notifyWorker = wakeRequest.pipe(
  Effect.forkDetach({ startImmediately: true, uninterruptible: false }),
  Effect.asVoid,
);
