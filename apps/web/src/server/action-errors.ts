import type { BlogErrors } from "./blog-errors.ts";
import type { PostErrors } from "./post-errors.ts";
import type { SessionErrors } from "./session-errors.ts";

export type ActionBoundaryError =
  | SessionErrors.AuthenticationRequired
  | SessionErrors.PasswordChangeRequired
  | PostErrors.InvalidPost
  | PostErrors.PostNotFound
  | PostErrors.PostRevisionNotFound
  | BlogErrors.BlogNotFound
  | BlogErrors.InvalidBlogSettings
  | { readonly _tag: string; readonly message: string };

export function actionErrorRedirect(
  error: ActionBoundaryError,
  fallbackPath: string,
): string | undefined {
  switch (error._tag) {
    case "AuthenticationRequired":
      return "/sign-in";
    case "PasswordChangeRequired":
      return "/change-password";
    case "InvalidPost":
    case "InvalidBlogSettings":
    case "InvalidPasswordChange":
    case "InvalidWorkspaceInput":
    case "SelfHostedWorkspaceAlreadyExists":
    case "MediaInvalidUpload":
    case "MediaQuotaExceeded":
    case "MediaAssetInUse":
    case "MediaInvalidState":
    case "MediaUploadExpired":
      return `${fallbackPath.includes("?") ? `${fallbackPath}&` : `${fallbackPath}?`}error=${encodeURIComponent(error.message)}`;
    case "PostNotFound":
    case "PostRevisionNotFound":
    case "BlogNotFound":
    case "MediaAssetNotFound":
      return `${fallbackPath}?error=${encodeURIComponent(error.message)}`;
    default:
      return undefined;
  }
}
