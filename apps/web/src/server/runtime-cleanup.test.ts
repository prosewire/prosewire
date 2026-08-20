import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  installRuntimeCleanup,
  type RuntimeLifecycleSource,
} from "./runtime-cleanup.ts";

describe("web runtime cleanup", () => {
  it("waits for one disposal before exiting on a termination signal", async () => {
    const events = new EventEmitter();
    let disposals = 0;
    let resolveDisposal: (() => void) | undefined;
    const disposal = new Promise<void>((resolve) => {
      resolveDisposal = resolve;
    });
    const exits: Array<number> = [];
    const source = Object.assign(events, {
      exit: (code: number) => {
        exits.push(code);
      },
    }) as RuntimeLifecycleSource;
    const uninstall = installRuntimeCleanup(
      source,
      () => {
        disposals += 1;
        return disposal;
      },
      () => undefined,
    );

    events.emit("SIGTERM");
    events.emit("beforeExit");
    expect(disposals).toBe(1);
    expect(exits).toEqual([]);

    resolveDisposal?.();
    await disposal;
    await Promise.resolve();
    expect(exits).toEqual([0]);

    uninstall();
  });
});
