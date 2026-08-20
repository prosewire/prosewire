import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import { WebConfig } from "./config.ts";
import { Database, type DatabaseError } from "./database.ts";

export class AuthInitializationError extends Schema.TaggedError<AuthInitializationError>()(
  "AuthInitializationError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Authentication service initialization failed";
  }
}

export const emailPasswordPolicy = {
  enabled: true,
  disableSignUp: true,
  requireEmailVerification: false,
} as const;

function buildAuth(database: Db, secret: string, publicUrl: string) {
  return betterAuth({
    baseURL: publicUrl,
    secret,
    trustedOrigins: [publicUrl],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: databaseSchema.user,
        session: databaseSchema.session,
        account: databaseSchema.account,
        verification: databaseSchema.verification,
      },
    }),
    emailAndPassword: emailPasswordPolicy,
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "member", input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
  });
}

type WebAuth = ReturnType<typeof buildAuth>;

export interface AuthShape {
  readonly get: Effect.Effect<
    WebAuth,
    DatabaseError | AuthInitializationError
  >;
}

export class Auth extends Context.Service<Auth, AuthShape>()(
  "@prosewire/web/Auth",
) {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const database = yield* Database;
      const config = yield* WebConfig;
      const get = yield* Effect.cached(
        Effect.gen(function* () {
          const client = yield* database.client;
          return yield* Effect.try({
            try: () =>
              buildAuth(client, Redacted.value(config.authSecret), config.publicUrl),
            catch: (cause) => new AuthInitializationError({ cause }),
          });
        }),
      );
      return { get };
    }),
  );
}

export const getAuth = Effect.fn("WebAuth.get")(function* () {
  const auth = yield* Auth;
  return yield* auth.get;
});

export * as AuthService from "./auth-service";
