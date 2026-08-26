import { Schema } from "effect";
import { DurableQueue } from "effect/unstable/workflow";

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
