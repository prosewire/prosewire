import { describe, expect, it } from "@effect/vitest";
import {
  EmailDeliveryError,
  EmailDeliveryJob,
} from "@prosewire/jobs/email-queue";
import { Effect } from "effect";
import { make } from "./email-delivery.ts";

const job = new EmailDeliveryJob({
  outboxId: "outbox-1",
  recipient: "person@example.com",
  subject: "Invitation",
  text: "Join the workspace",
  html: "<p>Join the workspace</p>",
});

describe("EmailDelivery", () => {
  it.effect("delivers the complete workflow payload", () => {
    const delivered: Array<EmailDeliveryJob> = [];
    const service = make((message) => {
      delivered.push(message);
      return Promise.resolve();
    });

    return Effect.gen(function* () {
      yield* service.deliver(job);
      expect(delivered).toEqual([job]);
    });
  });

  it.effect("returns a typed SMTP error for workflow retries", () => {
    const service = make(() => Promise.reject(new Error("SMTP unavailable")));

    return Effect.gen(function* () {
      const error = yield* Effect.flip(service.deliver(job));
      expect(error).toBeInstanceOf(EmailDeliveryError);
      expect(error.recipient).toBe(job.recipient);
    });
  });
});
