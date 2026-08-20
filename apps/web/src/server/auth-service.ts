import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import {
  organizationAccess,
  organizationRoles,
} from "@/lib/permissions";
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
  disableSignUp: false,
  requireEmailVerification: false,
} as const;

// Workspace mutations run through WorkspaceManagement so authorization and
// audit writes stay in the same application transaction boundary.
export const disabledOrganizationMutationPaths = [
  "/organization/accept-invitation",
  "/organization/add-team-member",
  "/organization/cancel-invitation",
  "/organization/create",
  "/organization/create-role",
  "/organization/create-team",
  "/organization/delete",
  "/organization/delete-role",
  "/organization/invite-member",
  "/organization/leave",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/remove-team",
  "/organization/remove-team-member",
  "/organization/set-active",
  "/organization/set-active-team",
  "/organization/update",
  "/organization/update-member-role",
  "/organization/update-role",
  "/organization/update-team",
] as const;

function buildAuth(
  database: Db,
  config: {
    readonly secret: string;
    readonly publicUrl: string;
    readonly allowSignUp: boolean;
  },
) {
  return betterAuth({
    baseURL: config.publicUrl,
    secret: config.secret,
    trustedOrigins: [config.publicUrl],
    disabledPaths: [...disabledOrganizationMutationPaths],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: databaseSchema.user,
        session: databaseSchema.session,
        account: databaseSchema.account,
        verification: databaseSchema.verification,
        organization: databaseSchema.organization,
        member: databaseSchema.member,
        invitation: databaseSchema.invitation,
      },
    }),
    emailAndPassword: emailPasswordPolicy,
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "member", input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (config.allowSignUp) return;
            const invitation = await database.query.invitation.findFirst({
              where: and(
                eq(databaseSchema.invitation.email, user.email.toLowerCase()),
                eq(databaseSchema.invitation.status, "pending"),
                gt(databaseSchema.invitation.expiresAt, new Date()),
              ),
            });
            if (!invitation) {
              throw new APIError("FORBIDDEN", {
                message: "Registration requires a workspace invitation",
              });
            }
          },
        },
      },
    },
    plugins: [
      organization({
        ac: organizationAccess,
        roles: organizationRoles,
        creatorRole: "owner",
        allowUserToCreateOrganization: false,
      }),
    ],
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
              buildAuth(client, {
                secret: Redacted.value(config.authSecret),
                publicUrl: config.publicUrl,
                allowSignUp:
                  config.environment !== "production" || config.allowSignUp,
              }),
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
