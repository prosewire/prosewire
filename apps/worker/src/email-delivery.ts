import {
  EmailDeliveryError,
  type EmailDeliveryJob,
} from "@prosewire/jobs/email-queue";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import nodemailer from "nodemailer";
import { WorkerConfig } from "./worker-config.ts";

export interface Interface {
  readonly deliver: (
    message: EmailDeliveryJob,
  ) => Effect.Effect<void, EmailDeliveryError>;
}

type Deliver = (message: EmailDeliveryJob) => Promise<void>;

export function make(send: Deliver): Interface {
  const deliver = Effect.fn("EmailDelivery.deliver")(
    (message: EmailDeliveryJob) =>
      Effect.tryPromise({
        try: () => send(message),
        catch: (cause) =>
          new EmailDeliveryError({ recipient: message.recipient, cause }),
      }).pipe(
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
      ? yield* Effect.try({
          try: () => nodemailer.createTransport(Redacted.value(smtpUrl)),
          catch: (cause) =>
            new EmailDeliveryError({ recipient: "<transport>", cause }),
        })
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
