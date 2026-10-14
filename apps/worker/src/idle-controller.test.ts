import { describe, expect, it, vi } from "vitest";
import { makeIdleController } from "./idle-controller.ts";

function deferred<A>() {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
}

function controlledWait() {
  const ticks: Array<() => void> = [];
  return {
    wait: (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const done = () => {
          signal.removeEventListener("abort", done);
          resolve();
        };
        signal.addEventListener("abort", done, { once: true });
        ticks.push(done);
      }),
    tick: () => ticks.shift()?.(),
  };
}

describe("idle worker sessions", () => {
  it("releases an empty runtime after two scans, then opens fresh resources on wake", async () => {
    const clock = controlledWait();
    const close = vi.fn(async () => {});
    const open = vi.fn(() => ({ cycle: async () => false, close }));
    const controller = makeIdleController(open, { ...clock, onError: vi.fn() });
    expect(controller.wake()).toBe(true);
    await flush();
    expect(close).not.toHaveBeenCalled();
    clock.tick();
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    controller.wake();
    await flush();
    expect(open).toHaveBeenCalledTimes(2);
    await controller.close();
  });

  it("keeps deferred work active and runs a new scan immediately on a hint", async () => {
    const clock = controlledWait();
    const close = vi.fn(async () => {});
    const cycle = vi.fn(async () => true);
    const controller = makeIdleController(() => ({ cycle, close }), {
      ...clock,
      onError: vi.fn(),
    });
    controller.wake();
    await flush();
    controller.wake();
    await flush();
    expect(cycle).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
    await controller.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("accepts a wake immediately and rescans if a commit arrives during an older scan", async () => {
    const clock = controlledWait();
    const first = deferred<boolean>();
    const cycle = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(false);
    const controller = makeIdleController(
      () => ({ cycle, close: async () => {} }),
      { ...clock, onError: vi.fn() },
    );
    expect(controller.wake()).toBe(true);
    expect(controller.wake()).toBe(true);
    expect(cycle).toHaveBeenCalledTimes(1);
    first.resolve(false);
    await flush();
    expect(cycle).toHaveBeenCalledTimes(2);
    await controller.close();
  });

  it("queues commits during disposal and never overlaps two runtimes", async () => {
    const clock = controlledWait();
    const release = deferred<void>();
    let live = 0;
    const open = vi.fn(() => {
      live += 1;
      expect(live).toBe(1);
      return {
        cycle: async () => false,
        close: async () => {
          await release.promise;
          live -= 1;
        },
      };
    });
    const controller = makeIdleController(open, { ...clock, onError: vi.fn() });
    controller.wake();
    await flush();
    clock.tick();
    await flush();
    expect(controller.wake()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    release.resolve();
    await flush();
    expect(open).toHaveBeenCalledTimes(2);
    await controller.close();
  });

  it("rebuilds failed startup resources and retries without losing HTTP ingress", async () => {
    const clock = controlledWait();
    const cycle = vi
      .fn()
      .mockRejectedValueOnce(new Error("database down"))
      .mockResolvedValue(true);
    const close = vi.fn(async () => {});
    const open = vi.fn(() => ({ cycle, close }));
    const onError = vi.fn();
    const controller = makeIdleController(open, { ...clock, onError });
    expect(controller.wake()).toBe(true);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(2);
    clock.tick();
    await flush();
    expect(cycle).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    await controller.close();
    expect(controller.wake()).toBe(false);
  });
  it("continues polling when closing failed startup resources rejects", async () => {
    const clock = controlledWait();
    const firstClose = vi.fn().mockRejectedValue(new Error("close failed"));
    const nextCycle = vi.fn(async () => true);
    const open = vi
      .fn()
      .mockReturnValueOnce({
        cycle: async () => {
          throw new Error("scan failed");
        },
        close: firstClose,
      })
      .mockReturnValue({ cycle: nextCycle, close: async () => {} });
    const onError = vi.fn();
    const controller = makeIdleController(open, { ...clock, onError });
    controller.wake();
    await flush();
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(2);
    clock.tick();
    await flush();
    expect(nextCycle).toHaveBeenCalledTimes(1);
    await controller.close();
  });
});
