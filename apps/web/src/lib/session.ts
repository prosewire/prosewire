import { Effect } from "effect";
import { headers } from "next/headers";
import { promiseEffect } from "@/server/external-effect";
import { SessionErrors } from "@/server/session-errors";
import { getAuth } from "./auth.ts";

export const getDashboardSessionEffect = Effect.fn("WebSession.get")(
  function* () {
    const requestHeaders = yield* promiseEffect(
      "next.headers",
      headers,
      (cause) =>
        new SessionErrors.SessionBoundaryError({
          operation: "read request headers",
          cause,
        }),
    );
    return yield* getSessionWithHeadersEffect(requestHeaders);
  },
);

export const getSessionWithHeadersEffect = Effect.fn(
  "WebSession.getWithHeaders",
)(function* (requestHeaders: Headers) {
  const auth = yield* getAuth();
  return yield* promiseEffect(
    "better-auth.getSession",
    () => auth.api.getSession({ headers: requestHeaders }),
    (cause) =>
      new SessionErrors.SessionBoundaryError({
        operation: "load session",
        cause,
      }),
  );
});

export const requireSessionAccess = <A>(
  session: A | null,
  disabledAt: Date | null | undefined,
  mustChangePassword: boolean | null | undefined,
): Effect.Effect<
  A,
  SessionErrors.AuthenticationRequired | SessionErrors.PasswordChangeRequired
> => {
  if (!session) {
    return Effect.fail(
      new SessionErrors.AuthenticationRequired({ reason: "missing-session" }),
    );
  }
  if (disabledAt) {
    return Effect.fail(
      new SessionErrors.AuthenticationRequired({ reason: "disabled-account" }),
    );
  }
  if (mustChangePassword) {
    return Effect.fail(new SessionErrors.PasswordChangeRequired({}));
  }
  return Effect.succeed(session);
};

export const requireDashboardSessionEffect = Effect.fn("WebSession.require")(
  function* () {
    const session = yield* getDashboardSessionEffect();
    return yield* requireSessionAccess(
      session,
      session?.user.disabledAt,
      session?.user.mustChangePassword,
    );
  },
);

export const requireSessionWithHeadersEffect = Effect.fn(
  "WebSession.requireWithHeaders",
)(function* (requestHeaders: Headers) {
  const session = yield* getSessionWithHeadersEffect(requestHeaders);
  return yield* requireSessionAccess(
    session,
    session?.user.disabledAt,
    session?.user.mustChangePassword,
  );
});
