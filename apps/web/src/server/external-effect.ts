import { Effect } from "effect";

export const promiseEffect = <A, E>(
  span: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
  onError: (cause: unknown) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: evaluate,
    catch: onError,
  }).pipe(Effect.withSpan(span));

export * as ExternalEffect from "./external-effect";
