import nodemailer from "nodemailer";
import {
  and,
  asc,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { WorkerDatabase } from "./database.ts";
import { WorkerConfig } from "./worker-config.ts";

const claimLimit = 20;
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

export class DeliverySummary extends Schema.Class<DeliverySummary>(
  "EmailOutbox.DeliverySummary",
)({
  claimed: Schema.Number,
  sent: Schema.Number,
  deferred: Schema.Number,
}) {}

export class Message extends Schema.Class<Message>("EmailOutbox.Message")({
  recipient: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  html: Schema.NullOr(Schema.String),
}) {}

export interface Interface {
  readonly processPending: (
    now: Date,
  ) => Effect.Effect<DeliverySummary, EmailOutboxPersistenceError>;
}

type Deliver = (message: Message) => Promise<void>;

function errorMessage(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 2_000);
}

function retryAt(now: Date, attempts: number): Date {
  const delay = Math.min(
    maximumBackoffMillis,
    30_000 * 2 ** Math.min(attempts, 7),
  );
  return new Date(now.getTime() + delay);
}

export function make(db: Db, deliver: Deliver): Interface {
  const processPending = Effect.fn("EmailOutbox.processPending")((now: Date) =>
    Effect.tryPromise({
      try: async () => {
        const staleBefore = new Date(now.getTime() - staleClaimMillis);
        const pending = await db.transaction(async (tx) => {
          const rows = await tx
            .select()
            .from(schema.emailOutbox)
            .where(
              and(
                isNull(schema.emailOutbox.sentAt),
                lte(schema.emailOutbox.availableAt, now),
                or(
                  isNull(schema.emailOutbox.claimedAt),
                  lte(schema.emailOutbox.claimedAt, staleBefore),
                ),
              ),
            )
            .orderBy(asc(schema.emailOutbox.createdAt))
            .limit(claimLimit)
            .for("update", { skipLocked: true });
          if (rows.length === 0) return rows;
          await tx
            .update(schema.emailOutbox)
            .set({ claimedAt: now })
            .where(inArray(schema.emailOutbox.id, rows.map(({ id }) => id)));
          return rows;
        });

        let sent = 0;
        let deferred = 0;
        for (const row of pending) {
          const message = new Message({
            recipient: row.recipient,
            subject: row.subject,
            text: row.textBody,
            html: row.htmlBody,
          });
          try {
            await deliver(message);
            await db
              .update(schema.emailOutbox)
              .set({ sentAt: now, claimedAt: null, lastError: null })
              .where(inArray(schema.emailOutbox.id, [row.id]));
            sent += 1;
          } catch (cause) {
            const attempts = row.attempts + 1;
            await db
              .update(schema.emailOutbox)
              .set({
                attempts,
                availableAt: retryAt(now, attempts),
                claimedAt: null,
                lastError: errorMessage(cause),
              })
              .where(inArray(schema.emailOutbox.id, [row.id]));
            deferred += 1;
          }
        }
        return new DeliverySummary({
          claimed: pending.length,
          sent,
          deferred,
        });
      },
      catch: (cause) =>
        new EmailOutboxPersistenceError({
          operation: "process pending email deliveries",
          cause,
        }),
    }),
  );

  return { processPending };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailOutbox",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* WorkerDatabase.Service;
    const config = yield* WorkerConfig;
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
    return Service.of(make(database.client, deliver));
  }),
);

export * as EmailOutbox from "./email-outbox.js";
