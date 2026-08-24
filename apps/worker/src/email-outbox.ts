import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import nodemailer from "nodemailer";
import { WorkerDatabase } from "./database.ts";
import { EmailOutboxId } from "./domain.ts";
import { EmailQueue } from "./email-queue.ts";
import { WorkerConfig } from "./worker-config.ts";

const dispatchLimit = 100;
const staleDispatchMillis = 5 * 60_000;
const staleClaimMillis = 5 * 60_000;
const maximumBackoffMillis = 60 * 60_000;

export class EmailOutboxPersistenceError extends Schema.TaggedError<EmailOutboxPersistenceError>()(
  "EmailOutboxPersistenceError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    recipient: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class DispatchSummary extends Schema.Class<DispatchSummary>(
  "EmailOutbox.DispatchSummary",
)({
  claimed: Schema.Finite,
  queued: Schema.Finite,
  released: Schema.Finite,
}) {}

export class DeliveryResult extends Schema.Class<DeliveryResult>(
  "EmailOutbox.DeliveryResult",
)({
  status: Schema.Literals(["sent", "deferred", "skipped"]),
  outboxId: EmailOutboxId,
}) {}

export class Message extends Schema.Class<Message>("EmailOutbox.Message")({
  recipient: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  html: Schema.NullOr(Schema.String),
}) {}

export interface Queue {
  readonly offer: (
    outboxId: EmailOutboxId,
  ) => Effect.Effect<void, EmailQueue.EmailQueueError>;
  readonly take: <E>(
    handle: (job: EmailQueue.EmailDeliveryJob) => Effect.Effect<void, E>,
  ) => Effect.Effect<void, E | EmailQueue.EmailQueueError>;
}

export interface Interface {
  readonly dispatchPending: (
    now: Date,
  ) => Effect.Effect<DispatchSummary, EmailOutboxPersistenceError>;
  readonly processNext: Effect.Effect<
    void,
    EmailOutboxPersistenceError | EmailQueue.EmailQueueError
  >;
}

type Deliver = (message: Message) => Promise<void>;
type EmailRow = typeof schema.emailOutbox.$inferSelect;

function errorMessage(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(
    0,
    2_000,
  );
}

function retryAt(now: Date, attempts: number): Date {
  const delay = Math.min(
    maximumBackoffMillis,
    30_000 * 2 ** Math.min(attempts, 7),
  );
  return new Date(now.getTime() + delay);
}

function persistence<A>(
  operation: string,
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, EmailOutboxPersistenceError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new EmailOutboxPersistenceError({ operation, cause }),
  });
}

async function claimDispatchable(
  db: Db,
  now: Date,
): Promise<ReadonlyArray<EmailOutboxId>> {
  const staleBefore = new Date(now.getTime() - staleDispatchMillis);
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: schema.emailOutbox.id })
      .from(schema.emailOutbox)
      .where(
        and(
          isNull(schema.emailOutbox.sentAt),
          lte(schema.emailOutbox.availableAt, now),
          or(
            isNull(schema.emailOutbox.queuedAt),
            lte(schema.emailOutbox.queuedAt, staleBefore),
          ),
          or(
            isNull(schema.emailOutbox.claimedAt),
            lte(schema.emailOutbox.claimedAt, staleBefore),
          ),
        ),
      )
      .orderBy(asc(schema.emailOutbox.createdAt))
      .limit(dispatchLimit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(schema.emailOutbox)
      .set({ queuedAt: now })
      .where(
        inArray(
          schema.emailOutbox.id,
          rows.map(({ id }) => id),
        ),
      );
    return rows.map(({ id }) => EmailOutboxId.make(id));
  });
}

async function releaseDispatch(
  db: Db,
  outboxId: EmailOutboxId,
  queuedAt: Date,
): Promise<void> {
  await db
    .update(schema.emailOutbox)
    .set({ queuedAt: null })
    .where(
      and(
        eq(schema.emailOutbox.id, outboxId),
        eq(schema.emailOutbox.queuedAt, queuedAt),
        isNull(schema.emailOutbox.sentAt),
      ),
    );
}

async function claimDelivery(
  db: Db,
  outboxId: EmailOutboxId,
  now: Date,
): Promise<EmailRow | undefined> {
  const staleBefore = new Date(now.getTime() - staleClaimMillis);
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.emailOutbox)
      .where(
        and(
          eq(schema.emailOutbox.id, outboxId),
          isNull(schema.emailOutbox.sentAt),
          lte(schema.emailOutbox.availableAt, now),
          or(
            isNull(schema.emailOutbox.claimedAt),
            lte(schema.emailOutbox.claimedAt, staleBefore),
          ),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    const row = rows[0];
    if (!row) return undefined;
    await tx
      .update(schema.emailOutbox)
      .set({ claimedAt: now })
      .where(eq(schema.emailOutbox.id, outboxId));
    return row;
  });
}

export function make(db: Db, deliver: Deliver, queue: Queue): Interface {
  const deliverOne = Effect.fn("EmailOutbox.deliverOne")(
    (outboxId: EmailOutboxId) =>
      Effect.gen(function* () {
        const now = new Date(yield* Clock.currentTimeMillis);
        const row = yield* persistence("claim email delivery", () =>
          claimDelivery(db, outboxId, now),
        );
        if (!row) {
          return new DeliveryResult({ status: "skipped", outboxId });
        }

        const message = new Message({
          recipient: row.recipient,
          subject: row.subject,
          text: row.textBody,
          html: row.htmlBody,
        });
        const send = Effect.tryPromise({
          try: () => deliver(message),
          catch: (cause) =>
            new EmailDeliveryError({ recipient: message.recipient, cause }),
        });

        return yield* send.pipe(
          Effect.matchEffect({
            onFailure: (error) => {
              const attempts = row.attempts + 1;
              return persistence("defer email delivery", () =>
                db
                  .update(schema.emailOutbox)
                  .set({
                    attempts,
                    availableAt: retryAt(now, attempts),
                    queuedAt: null,
                    claimedAt: null,
                    lastError: errorMessage(error.cause),
                  })
                  .where(eq(schema.emailOutbox.id, outboxId)),
              ).pipe(
                Effect.as(new DeliveryResult({ status: "deferred", outboxId })),
              );
            },
            onSuccess: () =>
              persistence("complete email delivery", () =>
                db
                  .update(schema.emailOutbox)
                  .set({ sentAt: now, claimedAt: null, lastError: null })
                  .where(eq(schema.emailOutbox.id, outboxId)),
              ).pipe(
                Effect.as(new DeliveryResult({ status: "sent", outboxId })),
              ),
          }),
        );
      }),
  );

  const dispatchPending = Effect.fn("EmailOutbox.dispatchPending")(
    (now: Date) =>
      Effect.gen(function* () {
        const outboxIds = yield* persistence("claim email dispatches", () =>
          claimDispatchable(db, now),
        );
        const results = yield* Effect.forEach(
          outboxIds,
          (outboxId) =>
            queue.offer(outboxId).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  persistence("release email dispatch", () =>
                    releaseDispatch(db, outboxId, now),
                  ).pipe(
                    Effect.tap(() =>
                      Effect.logError("Failed to queue email delivery", error),
                    ),
                    Effect.as(false),
                  ),
                onSuccess: () => Effect.succeed(true),
              }),
            ),
          { concurrency: 10 },
        );
        const queued = results.filter(Boolean).length;
        return new DispatchSummary({
          claimed: outboxIds.length,
          queued,
          released: outboxIds.length - queued,
        });
      }),
  );

  const processNext = queue.take((job) =>
    deliverOne(job.outboxId).pipe(
      Effect.tap((result) =>
        result.status === "skipped"
          ? Effect.void
          : Effect.logInfo(`Email delivery ${result.status}`, {
              outboxId: result.outboxId,
            }),
      ),
      Effect.asVoid,
    ),
  );

  return { dispatchPending, processNext };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailOutbox",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* WorkerDatabase.Service;
    const config = yield* WorkerConfig;
    const queue = yield* EmailQueue.Service;
    const smtpUrl = Option.getOrUndefined(config.smtpUrl);
    const transport = smtpUrl
      ? yield* Effect.try({
          try: () => nodemailer.createTransport(Redacted.value(smtpUrl)),
          catch: (cause) =>
            new EmailDeliveryError({ recipient: "<transport>", cause }),
        })
      : undefined;
    const deliver: Deliver = async (message) => {
      if (!transport) {
        if (config.environment === "production") {
          throw new EmailDeliveryError({
            recipient: message.recipient,
            cause: new Error("SMTP_URL is required in production"),
          });
        }
        return;
      }
      try {
        await transport.sendMail({
          from: config.emailFrom,
          to: message.recipient,
          subject: message.subject,
          text: message.text,
          ...(message.html === null ? {} : { html: message.html }),
        });
      } catch (cause) {
        throw new EmailDeliveryError({ recipient: message.recipient, cause });
      }
    };
    return Service.of(make(database.client, deliver, queue));
  }),
);

export * as EmailOutbox from "./email-outbox.js";
