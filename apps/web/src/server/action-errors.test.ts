import { describe, expect, it } from "vitest";

import { actionErrorRedirect } from "./action-errors.ts";
import { DatabaseError } from "./database.ts";
import { PostId, PostRevisionId } from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import { SessionErrors } from "./session-errors.ts";

describe("actionErrorRedirect", () => {
  it("maps authentication failures to sign-in", () => {
    expect(
      actionErrorRedirect(
        new SessionErrors.AuthenticationRequired({ reason: "missing-session" }),
        "/posts/new",
      ),
    ).toBe("/sign-in");
  });

  it("returns validation and not-found failures to the form", () => {
    expect(
      actionErrorRedirect(
        new PostErrors.InvalidPost({ message: "Title and blog are required" }),
        "/posts/new",
      ),
    ).toBe("/posts/new?error=Title%20and%20blog%20are%20required");
    expect(
      actionErrorRedirect(
        new PostErrors.PostNotFound({
          postId: PostId.make("11111111-1111-4111-8111-111111111111"),
        }),
        "/posts/1/edit",
      ),
    ).toBe(
      "/posts/1/edit?error=Post%2011111111-1111-4111-8111-111111111111%20was%20not%20found",
    );
    expect(
      actionErrorRedirect(
        new PostErrors.PostRevisionNotFound({
          postId: PostId.make("11111111-1111-4111-8111-111111111111"),
          revisionId: PostRevisionId.make(
            "22222222-2222-4222-8222-222222222222",
          ),
        }),
        "/posts/1/edit",
      ),
    ).toContain("Revision%2022222222-2222-4222-8222-222222222222");
  });

  it("does not disguise operational failures as form errors", () => {
    expect(
      actionErrorRedirect(
        new DatabaseError({
          operation: "post.save",
          cause: new Error("offline"),
        }),
        "/posts/new",
      ),
    ).toBeUndefined();
  });
});
