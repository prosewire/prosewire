import { Effect, Schema } from "effect";
import { getDashboardSessionEffect } from "@/lib/session";
import { AccountSecurity } from "./account-security.ts";
import { runAppEffect } from "./app-runtime.ts";
import { UserId } from "./domain.ts";
import { SessionErrors } from "./session-errors.ts";

export type ChangeRequiredPasswordBoundaryInput =
  typeof AccountSecurity.ChangeRequiredPasswordInput.Encoded;

export function changeRequiredPassword(
  input: ChangeRequiredPasswordBoundaryInput,
) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* Schema.decodeEffect(
        AccountSecurity.ChangeRequiredPasswordInput,
      )(input).pipe(
        Effect.mapError(
          () =>
            new AccountSecurity.InvalidPasswordChange({
              message: "Enter the current and new passwords",
            }),
        ),
      );
      const session = yield* getDashboardSessionEffect();
      if (!session) {
        return yield* new SessionErrors.AuthenticationRequired({
          reason: "missing-session",
        });
      }
      if (session.user.disabledAt) {
        return yield* new SessionErrors.AuthenticationRequired({
          reason: "disabled-account",
        });
      }
      const security = yield* AccountSecurity.Service;
      return yield* security.changeRequiredPassword(
        command,
        UserId.make(session.user.id),
      );
    }),
  );
}

export * as AccountEntrypoints from "./account-entrypoints";
