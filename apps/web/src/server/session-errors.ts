import { Schema } from "effect";

export class AuthenticationRequired extends Schema.TaggedError<AuthenticationRequired>()(
  "AuthenticationRequired",
  { reason: Schema.Literals(["missing-session", "disabled-account"]) },
) {
  override get message(): string {
    return this.reason === "missing-session"
      ? "Sign in is required"
      : "This account is disabled";
  }
}

export class SessionBoundaryError extends Schema.TaggedError<SessionBoundaryError>()(
  "SessionBoundaryError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class PasswordChangeRequired extends Schema.TaggedError<PasswordChangeRequired>()(
  "PasswordChangeRequired",
  {},
) {
  override get message(): string {
    return "Change the temporary password before continuing";
  }
}

export type Error =
  | AuthenticationRequired
  | PasswordChangeRequired
  | SessionBoundaryError;

export * as SessionErrors from "./session-errors";
