import { describe, expect, it } from "vitest";
import { InvalidPasswordChange } from "./account-security.ts";
import { actionErrorRedirect } from "./action-errors.ts";
import { DatabaseError } from "./database.ts";
import { PostId, PostRevisionId } from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import { SessionErrors } from "./session-errors.ts";
import { SelfHostedWorkspaceAlreadyExists } from "./workspace-management.ts";

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

  it("returns a self-hosted workspace conflict to onboarding", () => {
    expect(
      actionErrorRedirect(
        new SelfHostedWorkspaceAlreadyExists({
          message: "This instance already has a team",
        }),
        "/onboarding",
      ),
    ).toBe("/onboarding?error=This%20instance%20already%20has%20a%20team");
  });

  it("routes forced password changes and preserves existing query values", () => {
    expect(
      actionErrorRedirect(
        new SessionErrors.PasswordChangeRequired({}),
        "/dashboard",
      ),
    ).toBe("/change-password");
    expect(
      actionErrorRedirect(
        new InvalidPasswordChange({ message: "Try another password" }),
        "/change-password?returnTo=%2Fdashboard",
      ),
    ).toBe(
      "/change-password?returnTo=%2Fdashboard&error=Try%20another%20password",
    );
  });
});
