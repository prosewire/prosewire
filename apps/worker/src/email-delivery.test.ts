import { describe, expect, it } from "@effect/vitest";
import {
  EmailDeliveryError,
  EmailDeliveryJob,
} from "@prosewire/jobs/email-queue";
import { Effect, Fiber, Layer, Option, Redacted } from "effect";
import { vi } from "vitest";
import { isRetryable, layer, make, Service } from "./email-delivery.ts";
import { WorkerConfig } from "./worker-config.ts";

const transport = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({})),
  close: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => transport) },
}));

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
  it.each([
    [{ responseCode: 450 }, true],
    [{ responseCode: 550 }, false],
    [{ code: "EAUTH", responseCode: 535 }, false],
    [{ code: "ECONNRESET" }, true],
    [{ code: "ETIMEDOUT" }, true],
    [{ code: "EENVELOPE" }, false],
    [new Error("SMTP_URL is required"), false],
  ])("classifies SMTP failure %j", (cause, retryable) => {
    expect(
      isRetryable(new EmailDeliveryError({ recipient: job.recipient, cause })),
    ).toBe(retryable);
  });

  it.effect(
    "settles an active send before interruption releases the caller",
    () =>
      Effect.gen(function* () {
        let settle: (() => void) | undefined;
        let completed = false;
        const service = make(
          () =>
            new Promise<void>((resolve) => {
              settle = () => {
                completed = true;
                resolve();
              };
            }),
        );
        const sending = yield* service.deliver(job).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(settle).toBeDefined();
        const interrupted = yield* Fiber.interrupt(sending).pipe(
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        expect(completed).toBe(false);
        settle?.();
        yield* Fiber.join(interrupted);
        expect(completed).toBe(true);
      }),
  );
  it.effect("closes the configured transport with its service scope", () =>
    Effect.gen(function* () {
      transport.close.mockClear();
      transport.sendMail.mockClear();
      yield* Effect.gen(function* () {
        const delivery = yield* Service;
        yield* delivery.deliver(job);
        expect(transport.close).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          layer.pipe(
            Layer.provide(
              Layer.succeed(WorkerConfig, {
                databaseUrl: Redacted.make("postgres://test"),
                redisUrl: Redacted.make("redis://test"),
                analyticsRetentionDays: 365,
                emailWorkerConcurrency: 1,
                smtpUrl: Option.some(Redacted.make("smtp://localhost")),
                emailFrom: "test@localhost",
                environment: "test",
              }),
            ),
          ),
        ),
      );
      expect(transport.sendMail).toHaveBeenCalledOnce();
      expect(transport.close).toHaveBeenCalledOnce();
    }),
  );
});
