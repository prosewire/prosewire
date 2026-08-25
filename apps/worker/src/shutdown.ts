import { Context, Effect, Fiber, Layer } from "effect";

export interface SignalSource {
  readonly once: (
    signal: "SIGINT" | "SIGTERM",
    listener: () => void,
  ) => unknown;
  readonly off: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
}

const waitForShutdown = (source: SignalSource) =>
  Effect.callback<void>((resume) => {
    let completed = false;

    const shutdown = () => {
      if (completed) return;
      completed = true;
      source.off("SIGINT", shutdown);
      source.off("SIGTERM", shutdown);
      resume(Effect.void);
    };

    source.once("SIGINT", shutdown);
    source.once("SIGTERM", shutdown);

    return Effect.sync(() => {
      source.off("SIGINT", shutdown);
      source.off("SIGTERM", shutdown);
    });
  });

export class ShutdownSignal extends Context.Service<
  ShutdownSignal,
  { readonly wait: Effect.Effect<void> }
>()("@prosewire/worker/ShutdownSignal") {
  static readonly layerWith = (source: SignalSource) =>
    Layer.effect(
      ShutdownSignal,
      waitForShutdown(source).pipe(
        Effect.forkScoped,
        Effect.map((fiber) => ({ wait: Fiber.join(fiber) })),
      ),
    );

  static readonly layer = ShutdownSignal.layerWith(process);
}

export const runUntilShutdown = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | void, E, R | ShutdownSignal> =>
  Effect.flatMap(ShutdownSignal, (shutdown) =>
    Effect.raceFirst(effect, shutdown.wait),
  );
