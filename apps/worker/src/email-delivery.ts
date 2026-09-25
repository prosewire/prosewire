import {
  EmailDeliveryError,
  type EmailDeliveryJob,
} from "@prosewire/jobs/email-queue";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import nodemailer from "nodemailer";
import { WorkerConfig } from "./worker-config.ts";

export interface Interface {
  readonly deliver: (
    message: EmailDeliveryJob,
  ) => Effect.Effect<void, EmailDeliveryError>;
}

type Deliver = (message: EmailDeliveryJob) => Promise<void>;

const smtpFailure = Schema.Struct({
  responseCode: Schema.optionalKey(Schema.Finite),
  code: Schema.optionalKey(Schema.String),
});

export const isRetryable = (error: EmailDeliveryError): boolean => {
  const failure = Schema.decodeUnknownOption(smtpFailure)(error.cause);
  if (Option.isNone(failure)) return false;
  const { responseCode, code } = failure.value;
  if (responseCode !== undefined)
    return responseCode >= 400 && responseCode < 500;
  return (
    code !== undefined &&
    [
      "ECONNECTION",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ESOCKET",
      "EDNS",
    ].includes(code)
  );
};

export function make(send: Deliver): Interface {
  const deliver = Effect.fn("EmailDelivery.deliver")(
    (message: EmailDeliveryJob) =>
      Effect.tryPromise({
        try: () => send(message),
        catch: (cause) =>
          new EmailDeliveryError({ recipient: message.recipient, cause }),
      }).pipe(
        // Nodemailer has no per-message AbortSignal. Settle the bounded SMTP
        // operation before interruption releases the durable queue lease.
        Effect.uninterruptible,
        Effect.tap(() =>
          Effect.logInfo("Email delivered", { recipient: message.recipient }),
        ),
      ),
  );

  return { deliver };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailDelivery",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* WorkerConfig;
    const smtpUrl = Option.getOrUndefined(config.smtpUrl);
    const transport = smtpUrl
      ? yield* Effect.acquireRelease(
          Effect.try({
            try: () =>
              nodemailer.createTransport({
                url: Redacted.value(smtpUrl),
                connectionTimeout: 10_000,
                greetingTimeout: 10_000,
                socketTimeout: 30_000,
              }),
            catch: (cause) =>
              new EmailDeliveryError({ recipient: "<transport>", cause }),
          }),
          (transport) => Effect.sync(() => transport.close()),
        )
      : undefined;
    const send: Deliver = async (message) => {
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
    return Service.of(make(send));
  }),
);

export * as EmailDelivery from "./email-delivery.js";
