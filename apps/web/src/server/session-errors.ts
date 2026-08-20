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

export type Error = AuthenticationRequired;

export * as SessionErrors from "./session-errors";
