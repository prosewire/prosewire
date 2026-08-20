import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";
import { make } from "./analytics-retention.ts";

describe("AnalyticsRetention", () => {
  it.effect("deletes and reports expired raw events", () => {
    const returning = vi.fn().mockResolvedValue([{ id: "one" }, { id: "two" }]);
    const where = vi.fn(() => ({ returning }));
    const remove = vi.fn(() => ({ where }));
    const service = make({ delete: remove } as never, 365);

    return Effect.gen(function* () {
      const deleted = yield* service.pruneExpired(
        new Date("2026-08-20T00:00:00.000Z"),
      );
      expect(deleted).toBe(2);
      expect(remove).toHaveBeenCalledOnce();
      expect(where).toHaveBeenCalledOnce();
    });
  });
});
