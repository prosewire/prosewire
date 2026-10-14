import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { setTimeout } from "node:timers/promises";
import { Clock, Effect, Schema } from "effect";
import { makeWorkerRuntime } from "./app-runtime.ts";
import { makeIdleController } from "./idle-controller.ts";
import { hasPendingWork } from "./idle-work.ts";
import { WorkflowRetention } from "./workflow-retention.ts";
import {
  startAnalyticsRetention,
  startEmailOutbox,
  startScheduledPublishing,
} from "./workflows.ts";

function workerPort() {
  return Schema.decodeSync(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  )(Number(process.env["PORT"] ?? "3000"));
}

function idleHttpConfig() {
  const token = process.env["PROSEWIRE_WORKER_WAKE_TOKEN"];
  if (!token || token.length < 32)
    throw new Error(
      "Idle worker requires a wake token of at least 32 characters",
    );
  if (process.env["PROSEWIRE_WORKER_RECOVERY_CONFIGURED"] !== "true") {
    throw new Error(
      "Idle worker requires a verified external recovery wake; set PROSEWIRE_WORKER_RECOVERY_CONFIGURED=true only after configuring it",
    );
  }
  return { port: workerPort(), authorization: Buffer.from(`Bearer ${token}`) };
}

function makeWorkerController() {
  let nextRetentionAt = 0;
  return makeIdleController(
    () => {
      const runtime = makeWorkerRuntime();
      const cycle = Effect.gen(function* () {
        const millis = yield* Clock.currentTimeMillis;
        const now = new Date(millis);
        yield* startScheduledPublishing(now);
        yield* startEmailOutbox();
        if (millis >= nextRetentionAt) {
          yield* startAnalyticsRetention(now);
          const retention = yield* WorkflowRetention.Service;
          yield* retention.pruneCompleted(now);
          nextRetentionAt = millis + 86_400_000;
        }
        return yield* hasPendingWork;
      });
      return {
        cycle: () => runtime.runPromise(cycle),
        close: async () => {
          await runtime.dispose();
          console.info(
            "Worker runtime closed; PostgreSQL and Redis connections released",
          );
        },
      };
    },
    {
      wait: async (signal) => {
        try {
          await setTimeout(30_000, undefined, { signal });
        } catch (cause) {
          if (!signal.aborted) throw cause;
        }
      },
      onError: () =>
        console.error(
          "Worker cycle failed; polling continues while durable work remains",
        ),
    },
  );
}

function authorized(supplied: Buffer, expected: Buffer) {
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function matches(request: IncomingMessage, method: string, path: string) {
  return request.method === method && request.url === path;
}

function suppliedAuthorization(request: IncomingMessage) {
  return Buffer.from(request.headers.authorization ?? "");
}

function acceptWake(controller: ReturnType<typeof makeIdleController>) {
  return controller.wake() ? 202 : 503;
}

function wakeServer(
  controller: ReturnType<typeof makeIdleController>,
  authorization: Buffer,
) {
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    request.resume();
    if (matches(request, "GET", "/health")) {
      response.writeHead(200).end("ready");
      return;
    }
    if (!authorized(suppliedAuthorization(request), authorization)) {
      response.writeHead(401).end();
      return;
    }
    if (!matches(request, "POST", "/wake")) {
      response.writeHead(404).end();
      return;
    }
    // Accept the wake without making an editorial write await initialization,
    // retention or delivery. Durable work is recovered by startup scans.
    response.writeHead(acceptWake(controller)).end();
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}

export async function runIdleHttpWorker() {
  const { port, authorization } = idleHttpConfig();
  const controller = makeWorkerController();
  const server = wakeServer(controller, authorization);
  let stop!: () => void;
  const stopping = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const shutdown = () => stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "::", () => {
        server.off("error", reject);
        resolve();
      });
    });
    // Cold starts must recover pre-existing work even without a successful hint.
    controller.wake();
    console.info(
      "Idle worker HTTP ingress ready; external recovery wake required",
    );
    await stopping;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    const stopped = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    await controller.close();
    await stopped;
  }
}
