import { describe, expect, it } from "@effect/vitest";
import { EmailDeliveryJob, EmailQueueError } from "@prosewire/jobs/email-queue";
import { Effect } from "effect";
import { EmailDeliveryError, make, type Queue } from "./email-delivery.ts";

const job = new EmailDeliveryJob({
  recipient: "person@example.com",
  subject: "Invitation",
  text: "Join the workspace",
  html: "<p>Join the workspace</p>",
});

function queue(message: EmailDeliveryJob): Queue {
  return { take: (handle) => handle(message) };
}

describe("EmailDelivery", () => {
  it.effect("delivers the complete job payload consumed from Redis", () => {
    const delivered: Array<EmailDeliveryJob> = [];
    const service = make((message) => {
      delivered.push(message);
      return Promise.resolve();
    }, queue(job));

    return Effect.gen(function* () {
      yield* service.processNext;
      expect(delivered).toEqual([job]);
    });
  });

  it.effect("fails the handler so PersistedQueue can retry SMTP errors", () => {
    const service = make(
      () => Promise.reject(new Error("SMTP unavailable")),
      queue(job),
    );

    return Effect.gen(function* () {
      const error = yield* Effect.flip(service.processNext);
      expect(error).toBeInstanceOf(EmailDeliveryError);
    });
  });

  it.effect("preserves queue infrastructure errors", () => {
    const error = new EmailQueueError({
      operation: "take email delivery",
      cause: new Error("Redis unavailable"),
    });
    const service = make(() => Promise.resolve(), {
      take: () => Effect.fail(error),
    });

    return Effect.gen(function* () {
      expect(yield* Effect.flip(service.processNext)).toBe(error);
    });
  });
});
