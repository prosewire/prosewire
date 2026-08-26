import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { EmailDeliveryJob } from "@prosewire/jobs/email-queue";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Context, Effect, Schema } from "effect";

const defaultBatchSize = 25;
const defaultLeaseDurationMs = 5 * 60 * 1000;
const maximumRetryDelayMs = 5 * 60 * 1000;

export class EmailOutboxDatabaseError extends Schema.TaggedError<EmailOutboxDatabaseError>()(
  "EmailOutboxDatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Item {
  readonly id: string;
  readonly recipient: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly attempts: number;
}

export interface Store {
  readonly claim: (
    workerId: string,
    now: Date,
    staleBefore: Date,
    limit: number,
  ) => Promise<ReadonlyArray<Item>>;
  readonly markDispatched: (
    id: string,
    workerId: string,
    dispatchedAt: Date,
  ) => Promise<void>;
  readonly release: (
    id: string,
    workerId: string,
    availableAt: Date,
    lastError: string,
  ) => Promise<void>;
}

export interface Queue {
  readonly offer: (job: EmailDeliveryJob) => Effect.Effect<void, unknown>;
}

export interface DispatchResult {
  readonly dispatched: number;
  readonly deferred: number;
}

export interface Interface {
  readonly dispatchPending: (
    now: Date,
  ) => Effect.Effect<DispatchResult, EmailOutboxDatabaseError>;
}

function retryDelayMs(attempts: number): number {
  return Math.min(maximumRetryDelayMs, 1000 * 2 ** Math.min(attempts, 8));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    error.cause !== error
  ) {
    return errorMessage(error.cause);
  }
  return String(error);
}

function databaseOperation<A>(
  operation: string,
  evaluate: () => Promise<A>,
): Effect.Effect<A, EmailOutboxDatabaseError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new EmailOutboxDatabaseError({ operation, cause }),
  });
}

export function drizzleStore(db: Db): Store {
  return {
    claim: (workerId, now, staleBefore, limit) =>
      db.transaction(async (tx) => {
        const rows = await tx
          .select({
            id: schema.emailDeliveryOutbox.id,
            recipient: schema.emailDeliveryOutbox.recipient,
            subject: schema.emailDeliveryOutbox.subject,
            text: schema.emailDeliveryOutbox.text,
            html: schema.emailDeliveryOutbox.html,
            attempts: schema.emailDeliveryOutbox.attempts,
          })
          .from(schema.emailDeliveryOutbox)
          .where(
            and(
              isNull(schema.emailDeliveryOutbox.dispatchedAt),
              lte(schema.emailDeliveryOutbox.availableAt, now),
              or(
                isNull(schema.emailDeliveryOutbox.lockedAt),
                lt(schema.emailDeliveryOutbox.lockedAt, staleBefore),
              ),
            ),
          )
          .orderBy(asc(schema.emailDeliveryOutbox.createdAt))
          .limit(limit)
          .for("update", { skipLocked: true });

        if (rows.length === 0) return rows;
        await tx
          .update(schema.emailDeliveryOutbox)
          .set({ lockedAt: now, lockedBy: workerId })
          .where(
            inArray(
              schema.emailDeliveryOutbox.id,
              rows.map(({ id }) => id),
            ),
          );
        return rows;
      }),
    markDispatched: async (id, workerId, dispatchedAt) => {
      const rows = await db
        .update(schema.emailDeliveryOutbox)
        .set({
          dispatchedAt,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        })
        .where(
          and(
            eq(schema.emailDeliveryOutbox.id, id),
            eq(schema.emailDeliveryOutbox.lockedBy, workerId),
            isNull(schema.emailDeliveryOutbox.dispatchedAt),
          ),
        )
        .returning({ id: schema.emailDeliveryOutbox.id });
      if (rows.length === 0)
        throw new Error(`Email outbox lease lost for ${id}`);
    },
    release: async (id, workerId, availableAt, lastError) => {
      const rows = await db
        .update(schema.emailDeliveryOutbox)
        .set({
          attempts: sql`${schema.emailDeliveryOutbox.attempts} + 1`,
          availableAt,
          lockedAt: null,
          lockedBy: null,
          lastError,
        })
        .where(
          and(
            eq(schema.emailDeliveryOutbox.id, id),
            eq(schema.emailDeliveryOutbox.lockedBy, workerId),
            isNull(schema.emailDeliveryOutbox.dispatchedAt),
          ),
        )
        .returning({ id: schema.emailDeliveryOutbox.id });
      if (rows.length === 0)
        throw new Error(`Email outbox lease lost for ${id}`);
    },
  };
}

export function make(
  store: Store,
  queue: Queue,
  workerId: string,
  options: {
    readonly batchSize?: number;
    readonly leaseDurationMs?: number;
  } = {},
): Interface {
  const batchSize = options.batchSize ?? defaultBatchSize;
  const leaseDurationMs = options.leaseDurationMs ?? defaultLeaseDurationMs;

  const dispatchPending = Effect.fn("EmailOutbox.dispatchPending")(function* (
    now: Date,
  ) {
    const staleBefore = new Date(now.getTime() - leaseDurationMs);
    const items = yield* databaseOperation("claim pending emails", () =>
      store.claim(workerId, now, staleBefore, batchSize),
    );
    const results = yield* Effect.forEach(
      items,
      (item) =>
        queue
          .offer(
            new EmailDeliveryJob({
              outboxId: item.id,
              recipient: item.recipient,
              subject: item.subject,
              text: item.text,
              html: item.html,
            }),
          )
          .pipe(
            Effect.matchEffect({
              onFailure: (error) =>
                databaseOperation("release failed email dispatch", () =>
                  store.release(
                    item.id,
                    workerId,
                    new Date(now.getTime() + retryDelayMs(item.attempts)),
                    errorMessage(error),
                  ),
                ).pipe(Effect.as(false)),
              onSuccess: () =>
                databaseOperation("mark email dispatched", () =>
                  store.markDispatched(item.id, workerId, now),
                ).pipe(Effect.as(true)),
            }),
          ),
      { concurrency: 4 },
    );
    const dispatched = results.filter(Boolean).length;
    return { dispatched, deferred: results.length - dispatched };
  });

  return { dispatchPending };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailOutbox",
) {}

export * as EmailOutbox from "./email-outbox.js";
