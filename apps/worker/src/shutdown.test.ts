import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { Effect, ManagedRuntime } from "effect";

import {
  runUntilShutdown,
  ShutdownSignal,
  type SignalSource,
} from "./shutdown.ts";

function testSignalSource() {
  const emitter = new EventEmitter();
  let markListening: (() => void) | undefined;
  const listening = new Promise<void>((resolve) => {
    markListening = resolve;
  });
  const source: SignalSource = {
    once: (signal, listener) => {
      emitter.once(signal, listener);
      if (
        emitter.listenerCount("SIGINT") === 1 &&
        emitter.listenerCount("SIGTERM") === 1
      ) {
        markListening?.();
      }
    },
    off: (signal, listener) => emitter.off(signal, listener),
  };
  return { emitter, source, listening };
}

describe("ShutdownSignal", () => {
  it("listens during runtime startup and removes listeners on completion", async () => {
    const { emitter, source, listening } = testSignalSource();
    const runtime = ManagedRuntime.make(
      ShutdownSignal.layerWith(source),
    );
    const waiting = runtime.runPromise(
      Effect.flatMap(ShutdownSignal, (shutdown) => shutdown.wait),
    );

    await listening;
    expect(emitter.listenerCount("SIGINT")).toBe(1);
    expect(emitter.listenerCount("SIGTERM")).toBe(1);

    emitter.emit("SIGTERM");
    await waiting;
    await runtime.dispose();

    expect(emitter.listenerCount("SIGINT")).toBe(0);
    expect(emitter.listenerCount("SIGTERM")).toBe(0);
  });

  it("interrupts startup and releases acquired resources", async () => {
    const { emitter, source, listening } = testSignalSource();
    let acquired = false;
    let released = false;
    let reachedReady = false;
    let markAcquired: (() => void) | undefined;
    const acquisition = new Promise<void>((resolve) => {
      markAcquired = resolve;
    });
    const runtime = ManagedRuntime.make(
      ShutdownSignal.layerWith(source),
    );
    const startup = Effect.acquireRelease(
      Effect.sync(() => {
        acquired = true;
        markAcquired?.();
      }),
      () => Effect.sync(() => {
        released = true;
      }),
    ).pipe(
      Effect.flatMap(() => Effect.never),
      Effect.tap(() => Effect.sync(() => {
        reachedReady = true;
      })),
    );

    const running = runtime.runPromise(runUntilShutdown(startup).pipe(Effect.scoped));
    await Promise.all([listening, acquisition]);
    emitter.emit("SIGTERM");
    await running;
    await runtime.dispose();

    expect(acquired).toBe(true);
    expect(released).toBe(true);
    expect(reachedReady).toBe(false);
  });
});
