import nodemailer from "nodemailer";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { WebConfig } from "./config.ts";
import { promiseEffect } from "./external-effect.ts";

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    recipient: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Unable to deliver email to ${this.recipient}`;
  }
}

export class Message extends Schema.Class<Message>("TransactionalEmail.Message")({
  to: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  html: Schema.optional(Schema.String),
}) {}

export const create = Effect.fn("TransactionalEmail.create")(function* () {
  const config = yield* WebConfig;
  const smtpUrl = Option.map(config.smtpUrl, Redacted.value).pipe(
    Option.getOrUndefined,
  );
  const transport = smtpUrl
    ? nodemailer.createTransport(smtpUrl)
    : undefined;

  return {
    send: Effect.fn("TransactionalEmail.send")(function* (message: Message) {
      if (!transport) {
        if (config.environment === "production") {
          return yield* new EmailDeliveryError({
            recipient: message.to,
            cause: new Error("SMTP_URL is required in production"),
          });
        }
        yield* Effect.logInfo(
          `[email:${message.to}] ${message.subject}\n${message.text}`,
        );
        return;
      }
      yield* promiseEffect("smtp", "sendMail", () =>
        transport.sendMail({
          from: config.emailFrom,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html === undefined ? {} : { html: message.html }),
        }),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new EmailDeliveryError({ recipient: message.to, cause }),
        ),
      );
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/TransactionalEmail",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as TransactionalEmail from "./transactional-email";
