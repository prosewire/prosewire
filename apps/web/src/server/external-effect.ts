import { Effect, Schema } from "effect";

export class ExternalServiceError extends Schema.TaggedError<ExternalServiceError>()(
  "ExternalServiceError",
  {
    service: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `${this.service} operation failed: ${this.operation}`;
  }
}

export const promiseEffect = <A>(
  service: string,
  operation: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, ExternalServiceError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new ExternalServiceError({ service, operation, cause }),
  }).pipe(Effect.withSpan(`${service}.${operation}`));

export * as ExternalEffect from "./external-effect";
