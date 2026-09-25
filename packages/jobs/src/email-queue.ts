import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import { DurableQueue } from "effect/unstable/workflow";
import { redisQueuePrefix } from "./config.ts";
import * as JobRedis from "./redis.ts";

export const emailOutboxNotificationChannel = "prosewire_email_outbox";

export class EmailDeliveryJob extends Schema.Class<EmailDeliveryJob>(
  "EmailQueue.EmailDeliveryJob",
)({
  outboxId: Schema.String,
  recipient: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  html: Schema.NullOr(Schema.String),
}) {}

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    recipient: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/**
 * Redis hands email work to SMTP consumers. The durable deferred ties the
 * worker result back to the Effect workflow that requested delivery.
 */
export const queue = DurableQueue.make({
  name: "prosewire-email-v2",
  payload: EmailDeliveryJob,
  error: EmailDeliveryError,
  idempotencyKey: ({ outboxId }) => outboxId,
});

/** Call only for an expired, terminal workflow whose outbox remains dispatched. */
export const forgetCompleted = Effect.fn("EmailQueue.forgetCompleted")(
  function* (executionId: string, outboxId: string, prefix = redisQueuePrefix) {
    const redis = yield* JobRedis.Service;
    const name = `DurableQueue/${queue.name}`;
    // Effect RC.112 Activity.idempotencyKey uses the first 16 SHA-256 bytes.
    // The live queue test pins both this derivation and the Redis key layout.
    const id = createHash("sha256")
      .update(`${executionId}-${name}/${outboxId}`)
      .digest("hex")
      .slice(0, 32);
    const key = `${prefix}${name}`;
    const removed = yield* redis.send<number>(
      "EVAL",
      `if redis.call("LLEN", KEYS[1]) ~= 0
        or redis.call("HEXISTS", KEYS[2], ARGV[1]) ~= 0
        or redis.call("EXISTS", KEYS[3]) ~= 0
        or redis.call("HEXISTS", KEYS[4], ARGV[1]) ~= 0 then
          return 0
        end
        redis.call("SREM", KEYS[5], ARGV[1])
        return 1`,
      "5",
      key,
      `${key}:pending`,
      `${prefix}${id}:lock`,
      `${key}:failed`,
      `${key}:ids`,
      id,
    );
    return removed === 1;
  },
);
