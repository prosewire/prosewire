import { describe, expect, it } from "@effect/vitest";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq } from "drizzle-orm";
import { Effect, Fiber } from "effect";
import { EmailOutboxId } from "./domain.ts";
import { make, type Queue } from "./email-outbox.ts";
import { EmailDeliveryJob } from "./email-queue.ts";

const databaseUrl = process.env["DATABASE_URL"];

function immediateQueue(
  outboxId: EmailOutboxId,
  offered?: Array<EmailOutboxId>,
): Queue {
  return {
    offer: (id) =>
      Effect.sync(() => {
        offered?.push(id);
      }),
    take: (handle) => handle(new EmailDeliveryJob({ outboxId })),
  };
}

describe.skipIf(!databaseUrl)("Email outbox database leases", () => {
  it.live("allows one dispatcher and one consumer to win across replicas", () =>
    Effect.gen(function* () {
      if (!databaseUrl) return yield* Effect.die("DATABASE_URL is required");
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() => openDb(databaseUrl)),
        (opened) => Effect.promise(() => opened.close()),
      );
      const id = crypto.randomUUID();
      const outboxId = EmailOutboxId.make(id);
      const now = new Date();
      const offered: Array<EmailOutboxId> = [];
      yield* Effect.addFinalizer(() =>
        Effect.promise(() =>
          resource.client
            .delete(schema.emailOutbox)
            .where(eq(schema.emailOutbox.id, id)),
        ),
      );

      yield* Effect.promise(() =>
        resource.client.insert(schema.emailOutbox).values({
          id,
          recipient: "horizontal@example.com",
          subject: "Horizontal delivery",
          textBody: "Test",
          availableAt: now,
        }),
      );

      const dispatchOne = make(
        resource.client,
        () => Promise.resolve(),
        immediateQueue(outboxId, offered),
      );
      const dispatchTwo = make(
        resource.client,
        () => Promise.resolve(),
        immediateQueue(outboxId, offered),
      );
      yield* Effect.all(
        [dispatchOne.dispatchPending(now), dispatchTwo.dispatchPending(now)],
        { concurrency: "unbounded" },
      );
      expect(offered).toEqual([outboxId]);

      let deliveryStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        deliveryStarted = resolve;
      });
      let releaseDelivery!: () => void;
      const blocked = new Promise<void>((resolve) => {
        releaseDelivery = resolve;
      });
      let deliveries = 0;
      const deliver = async () => {
        deliveries += 1;
        deliveryStarted();
        await blocked;
      };
      const consumerOne = make(
        resource.client,
        deliver,
        immediateQueue(outboxId),
      );
      const consumerTwo = make(
        resource.client,
        deliver,
        immediateQueue(outboxId),
      );

      const first = yield* consumerOne.processNext.pipe(Effect.forkChild);
      yield* Effect.promise(() => started);
      yield* consumerTwo.processNext;
      yield* Effect.sync(releaseDelivery);
      yield* Fiber.join(first);

      expect(deliveries).toBe(1);
      const rows = yield* Effect.promise(() =>
        resource.client
          .select({ sentAt: schema.emailOutbox.sentAt })
          .from(schema.emailOutbox)
          .where(eq(schema.emailOutbox.id, id)),
      );
      expect(rows[0]?.sentAt).toBeInstanceOf(Date);
    }),
  );
});
