import { describe, expect, it } from "vitest";
import { actionErrorRedirect } from "./action-errors.ts";
import { PersistenceError } from "./api-content.ts";
import { toApiError } from "./api-errors.ts";
import { DatabaseError } from "./database.ts";
import { databaseConflictMessage } from "./database-conflicts.ts";
import { PostErrors } from "./post-errors.ts";

describe("persistence error boundaries", () => {
  it("recognizes only known unique constraints through driver wrappers", () => {
    const cause = new DatabaseError({
      operation: "post.create",
      cause: new Error("query failed", {
        cause: { code: "23505", constraint: "post_blog_slug_unique" },
      }),
    });
    expect(databaseConflictMessage(cause)).toBe(
      "A post with this slug already exists in this publication",
    );
    expect(
      databaseConflictMessage({
        code: "23505",
        constraint: "post_revision_version_unique",
      }),
    ).toBeUndefined();
    expect(
      databaseConflictMessage({
        code: "23503",
        constraint: "post_blog_slug_unique",
      }),
    ).toBeUndefined();
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(databaseConflictMessage(cycle)).toBeUndefined();
  });
  it("returns a safe nonempty message for persistence failures", () => {
    const cause = new PersistenceError({
      operation: "post.getApi",
      cause: new Error("secret connection details"),
    });
    expect(toApiError(cause)).toMatchObject({
      _tag: "ApiUnavailable",
      message: "Unable to complete the request. Please try again.",
    });
  });
  it("maps a slug conflict for both HTTP and dashboard callers", () => {
    const error = new PostErrors.PostConflict({
      message: "Slug already exists",
    });
    expect(toApiError(error)).toMatchObject({
      _tag: "ApiPostConflict",
      message: error.message,
    });
    expect(actionErrorRedirect(error, "/posts/new")).toBe(
      "/posts/new?error=Slug%20already%20exists",
    );
  });
});
