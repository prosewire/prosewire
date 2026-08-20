import type { BlogErrors } from "./blog-errors.ts";
import type { PostErrors } from "./post-errors.ts";
import type { SessionErrors } from "./session-errors.ts";

export type ActionBoundaryError =
  | SessionErrors.AuthenticationRequired
  | PostErrors.InvalidPost
  | PostErrors.PostNotFound
  | BlogErrors.BlogNotFound
  | ({ readonly _tag: string } & Error);

export function actionErrorRedirect(
  error: ActionBoundaryError,
  fallbackPath: string,
): string | undefined {
  switch (error._tag) {
    case "AuthenticationRequired":
      return "/sign-in";
    case "InvalidPost":
      return `${fallbackPath}?error=${encodeURIComponent(
        (error as PostErrors.InvalidPost).message,
      )}`;
    case "PostNotFound":
    case "BlogNotFound":
      return `${fallbackPath}?error=${encodeURIComponent(
        error.message,
      )}`;
    default:
      return undefined;
  }
}
