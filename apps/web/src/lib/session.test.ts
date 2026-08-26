import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import { requireSessionAccess } from "./session.ts";

describe("dashboard session access", () => {
  it("requires a password change for a bootstrap session", async () => {
    const result = await Effect.runPromise(
      Effect.result(requireSessionAccess({ id: "session-1" }, null, true)),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe("PasswordChangeRequired");
    }
  });

  it("allows a normal active session", async () => {
    await expect(
      Effect.runPromise(requireSessionAccess({ id: "session-1" }, null, false)),
    ).resolves.toEqual({ id: "session-1" });
  });
});
