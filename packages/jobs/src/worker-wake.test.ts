import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyWorker, requestWorkerWake } from "./worker-wake.ts";

const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn(async (millis: number) => {
    clock.now += millis;
  }),
}));
beforeEach(() => {
  clock.now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const configure = () => {
  vi.stubEnv("PROSEWIRE_WORKER_WAKE_URL", "http://worker.test/wake");
  vi.stubEnv(
    "PROSEWIRE_WORKER_WAKE_TOKEN",
    "test-worker-token-with-32-characters",
  );
};

describe("post-commit worker hints", () => {
  it("does no network work when the wake path is disabled", async () => {
    vi.stubEnv("PROSEWIRE_WORKER_WAKE_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await Effect.runPromise(notifyWorker);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("survives a slow Railway cold boot and returns after HTTP acceptance", async () => {
    configure();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, { status: clock.now < 20_000 ? 502 : 202 }),
    );
    vi.stubGlobal("fetch", fetch);
    await requestWorkerWake();
    expect(clock.now).toBeGreaterThanOrEqual(20_000);
    expect(clock.now).toBeLessThan(60_000);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { authorization: "Bearer test-worker-token-with-32-characters" },
    });
  });

  it("preserves committed work and bounds an unreachable worker to sixty seconds", async () => {
    configure();
    const fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetch);
    await expect(requestWorkerWake()).rejects.toThrow("60 seconds");
    expect(clock.now).toBe(60_000);
    expect(fetch.mock.calls.length).toBeLessThan(20);
  });

  it("does not retry authentication or configuration errors", async () => {
    configure();
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(requestWorkerWake()).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(clock.now).toBe(0);
  });
  it("lets the mutation return before a cold worker accepts its observed hint", async () => {
    configure();
    let accept!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      accept = resolve;
    });
    const fetch = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetch);
    await Effect.runPromise(notifyWorker);
    expect(fetch).toHaveBeenCalledTimes(1);
    accept(new Response(null, { status: 202 }));
    for (let step = 0; step < 8; step += 1) await Promise.resolve();
  });

  it("identifies configuration failures without exposing URL values", async () => {
    configure();
    vi.stubEnv("PROSEWIRE_WORKER_WAKE_URL", "malformed-secret-value");
    await expect(requestWorkerWake()).rejects.toMatchObject({
      name: "WorkerWakeConfigurationError",
      message: "Invalid PROSEWIRE_WORKER_WAKE_URL",
    });
  });
});
