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
    // Effect RC.115 Activity.idempotencyKey uses the first 16 SHA-256 bytes.
    // The live queue test pins both this derivation and the Redis key layout.
    const id = createHash("sha256")
      .update(`${executionId}-${name}/${outboxId}`)
      .digest("hex")
      .slice(0, 32);
    const key = `${prefix}${name}`;
    const removed = yield* redis.send<number>(
      "EVAL",
      `local score = redis.call("ZSCORE", KEYS[2], ARGV[1])
        if score == "inf" or redis.call("HEXISTS", KEYS[3], ARGV[1]) ~= 0
          or redis.call("EXISTS", KEYS[4]) ~= 0
          or (score == "0" and redis.call("LLEN", KEYS[1]) ~= 0) then
          return 0
        end
        redis.call("ZREM", KEYS[2], ARGV[1])
        return 1`,
      "4",
      key,
      `${key}:ids`,
      `${key}:pending`,
      `${prefix}${id}:lock`,
      id,
    );
    return removed === 1;
  },
);

// RC.115 changed queue identities from a set to a sorted set. Preserve old
// identities while copying in restartable batches before the new store opens.
export const migrateLegacyIdentities = Effect.fn(
  "EmailQueue.migrateLegacyIdentities",
)(function* (prefix = redisQueuePrefix) {
  const redis = yield* JobRedis.Service;
  const key = `${prefix}DurableQueue/${queue.name}:ids`;
  while (true) {
    const complete = yield* redis.send<number>(
      "EVAL",
      `if redis.call("TYPE", KEYS[1]).ok ~= "set" then return 1 end
          local cursor = redis.call("GET", KEYS[3]) or "0"
          local batch = redis.call("SSCAN", KEYS[1], cursor, "COUNT", 1000)
          for _, id in ipairs(batch[2]) do redis.call("ZADD", KEYS[2], 0, id) end
          if batch[1] == "0" then
            redis.call("RENAME", KEYS[2], KEYS[1])
            redis.call("DEL", KEYS[3])
            return 1
          end
          redis.call("SET", KEYS[3], batch[1])
          return 0`,
      "3",
      key,
      `${key}:migrating`,
      `${key}:cursor`,
    );
    if (complete === 1) return;
    yield* Effect.yieldNow;
  }
});
