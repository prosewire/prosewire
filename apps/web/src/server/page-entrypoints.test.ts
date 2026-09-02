import { Result, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ runAppEffect: vi.fn() }));

vi.mock("next/cache", () => ({ io: vi.fn() }));
vi.mock("./app-runtime.ts", () => ({ runAppEffect: runtime.runAppEffect }));

import { loadDashboardShell, loadEditPost } from "./page-entrypoints.ts";

class ForeignNoWorkspaceAvailable extends Schema.TaggedError<ForeignNoWorkspaceAvailable>()(
  "NoWorkspaceAvailable",
  { userId: Schema.String },
) {}

describe("dashboard page boundaries", () => {
  beforeEach(() => {
    runtime.runAppEffect.mockReset();
  });

  it("treats an invalid route identifier as a missing post", async () => {
    await expect(loadEditPost("not-a-uuid")).resolves.toEqual({
      _tag: "Success",
      value: null,
    });
  });

  it("recognizes a no-workspace error from a different module instance", async () => {
    const failure = new ForeignNoWorkspaceAvailable({ userId: "user-1" });
    runtime.runAppEffect.mockResolvedValue(Result.fail(failure));

    await expect(loadDashboardShell()).resolves.toEqual({
      _tag: "NeedsOnboarding",
    });
  });

  it.each([
    ["AuthenticationRequired", "Unauthorized"],
    ["PasswordChangeRequired", "PasswordChangeRequired"],
    ["BlogAccessDenied", "Forbidden"],
    ["WorkspaceAccessDenied", "Forbidden"],
    ["NoPublicationAvailable", "NeedsOnboarding"],
  ] as const)("maps %s to %s by tag", async (tag, expectedTag) => {
    runtime.runAppEffect.mockResolvedValue(
      Result.fail(Object.assign(new Error(tag), { _tag: tag })),
    );

    await expect(loadDashboardShell()).resolves.toEqual({
      _tag: expectedTag,
    });
  });

  it("rethrows unknown failures", async () => {
    const failure = Object.assign(new Error("unexpected"), {
      _tag: "UnexpectedFailure",
    });
    runtime.runAppEffect.mockResolvedValue(Result.fail(failure));

    await expect(loadDashboardShell()).rejects.toBe(failure);
  });
});
