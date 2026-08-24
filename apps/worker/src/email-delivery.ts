import type { EmailDeliveryJob } from "@prosewire/jobs/email-queue";
import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import nodemailer from "nodemailer";
import { WorkerConfig } from "./worker-config.ts";

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    recipient: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Queue {
  readonly take: <E>(
    handle: (job: EmailDeliveryJob) => Effect.Effect<void, E>,
  ) => Effect.Effect<void, E | EmailQueue.EmailQueueError>;
}

export interface Interface {
  readonly processNext: Effect.Effect<
    void,
    EmailDeliveryError | EmailQueue.EmailQueueError
  >;
}

type Deliver = (message: EmailDeliveryJob) => Promise<void>;

export function make(deliver: Deliver, queue: Queue): Interface {
  const processNext = queue.take((message) =>
    Effect.tryPromise({
      try: () => deliver(message),
      catch: (cause) =>
        new EmailDeliveryError({ recipient: message.recipient, cause }),
    }).pipe(
      Effect.tap(() =>
        Effect.logInfo("Email delivered", { recipient: message.recipient }),
      ),
    ),
  );

  return { processNext };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailDelivery",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
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
          throw new Error("SMTP_URL is required in production");
        }
        return;
      }
      await transport.sendMail({
        from: config.emailFrom,
        to: message.recipient,
        subject: message.subject,
        text: message.text,
        ...(message.html === null ? {} : { html: message.html }),
      });
    };
    return Service.of(make(deliver, queue));
  }),
);

export * as EmailDelivery from "./email-delivery.js";
