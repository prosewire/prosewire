import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Redacted, Schema } from "effect";
import { invitationRegistrationHeader } from "@/lib/auth-headers";
import { organizationAccess, organizationRoles } from "@/lib/permissions";
import { WebConfig, type WebConfigShape } from "./config.ts";
import { Database } from "./database.ts";

export class AuthInitializationError extends Schema.TaggedError<AuthInitializationError>()(
  "AuthInitializationError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
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

export interface RegistrationInvitationLookup {
  readonly hasPending: (input: {
    readonly invitationId: string;
    readonly email: string;
    readonly now: Date;
  }) => Promise<boolean>;
}

export function makeRegistrationInvitationLookup(
  database: Db,
): RegistrationInvitationLookup {
  return {
    hasPending: async (input) => {
      const invitation = await database.query.invitation.findFirst({
        where: and(
          eq(databaseSchema.invitation.id, input.invitationId),
          eq(databaseSchema.invitation.email, input.email),
          eq(databaseSchema.invitation.status, "pending"),
          gt(databaseSchema.invitation.expiresAt, input.now),
        ),
      });
      return invitation !== undefined;
    },
  };
}

export async function requireRegistrationInvitation(
  invitations: RegistrationInvitationLookup,
  input: {
    readonly allowSignUp: boolean;
    readonly email: string;
    readonly invitationId: string | null;
    readonly now: Date;
  },
): Promise<void> {
  if (input.allowSignUp) return;
  const invitationId = input.invitationId?.trim();
  if (!invitationId) {
    throw new APIError("FORBIDDEN", {
      message: "Registration requires a workspace invitation",
    });
  }
  const pending = await invitations.hasPending({
    invitationId,
    email: input.email.toLowerCase(),
    now: input.now,
  });
  if (!pending) {
    throw new APIError("FORBIDDEN", {
      message: "Registration requires a workspace invitation",
    });
  }
}

function buildAuth(
  database: Db,
  config: {
    readonly secret: string;
    readonly publicUrl: string;
    readonly allowSignUp: boolean;
    readonly now: () => Date;
    readonly cloudSocialProviders: WebConfigShape["cloudSocialProviders"];
  },
) {
  const invitations = makeRegistrationInvitationLookup(database);
  const socialProviders = {
    ...(config.cloudSocialProviders?.google
      ? {
          google: {
            clientId: config.cloudSocialProviders.google.clientId,
            clientSecret: Redacted.value(
              config.cloudSocialProviders.google.clientSecret,
            ),
            disableSignUp: !config.allowSignUp,
          },
        }
      : {}),
    ...(config.cloudSocialProviders?.github
      ? {
          github: {
            clientId: config.cloudSocialProviders.github.clientId,
            clientSecret: Redacted.value(
              config.cloudSocialProviders.github.clientSecret,
            ),
            disableSignUp: !config.allowSignUp,
          },
        }
      : {}),
  };

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
    socialProviders,
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "member",
          input: false,
        },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            await requireRegistrationInvitation(invitations, {
              allowSignUp: config.allowSignUp,
              email: user.email,
              invitationId:
                context?.getHeader(invitationRegistrationHeader) ?? null,
              now: config.now(),
            });
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
  readonly get: Effect.Effect<WebAuth, AuthInitializationError>;
}

export class Auth extends Context.Service<Auth, AuthShape>()(
  "@prosewire/web/Auth",
) {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const database = yield* Database;
      const config = yield* WebConfig;
      const clock = yield* Clock.Clock;
      const get = yield* Effect.cached(
        Effect.gen(function* () {
          const client = yield* database.client.pipe(
            Effect.mapError(
              (cause) =>
                new AuthInitializationError({
                  operation: "connect",
                  cause,
                }),
            ),
          );
          return yield* Effect.try({
            try: () =>
              buildAuth(client, {
                secret: Redacted.value(config.authSecret),
                publicUrl: config.publicUrl,
                allowSignUp:
                  config.environment !== "production" || config.allowSignUp,
                now: () => new Date(clock.currentTimeMillisUnsafe()),
                cloudSocialProviders: config.cloudSocialProviders,
              }),
            catch: (cause) =>
              new AuthInitializationError({
                operation: "initialize",
                cause,
              }),
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
