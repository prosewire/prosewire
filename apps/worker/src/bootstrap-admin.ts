import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { Config, Effect, Option, Redacted, Schema } from "effect";

export class BootstrapAdminConfigurationError extends Schema.TaggedError<BootstrapAdminConfigurationError>()(
  "BootstrapAdminConfigurationError",
  { message: Schema.String },
) {}

export interface BootstrapAdminConfig {
  readonly email: string;
  readonly name: string;
  readonly password: Redacted.Redacted<string>;
}

export type BootstrapAdminResult =
  | "created"
  | "refreshed"
  | "skipped-existing-installation";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const knownPlaceholderPasswords = new Set([
  "prosewire-local-dev",
  "replace-with-a-unique-admin-password",
  "replace-with-a-unique-temporary-password",
]);

export const loadBootstrapAdminConfig = Effect.gen(function* () {
  const deployment = yield* Config.string("PROSEWIRE_DEPLOYMENT").pipe(
    Config.withDefault("self-hosted"),
  );
  const configuredEmail = yield* Config.option(
    Config.string("PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL"),
  );
  const configuredPassword = yield* Config.option(
    Config.redacted("PROSEWIRE_BOOTSTRAP_ADMIN_PASSWORD"),
  );
  const name = yield* Config.string("PROSEWIRE_BOOTSTRAP_ADMIN_NAME").pipe(
    Config.withDefault("Prosewire Admin"),
  );
  const email = Option.getOrUndefined(configuredEmail)?.trim().toLowerCase();
  const password = Option.getOrUndefined(configuredPassword);

  if (!email && !password) return undefined;
  if (!email || !password) {
    return yield* new BootstrapAdminConfigurationError({
      message:
        "PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL and PROSEWIRE_BOOTSTRAP_ADMIN_PASSWORD must be configured together",
    });
  }
  if (deployment !== "self-hosted") {
    return yield* new BootstrapAdminConfigurationError({
      message:
        "Bootstrap administrator credentials are supported only when PROSEWIRE_DEPLOYMENT=self-hosted",
    });
  }
  if (!emailPattern.test(email)) {
    return yield* new BootstrapAdminConfigurationError({
      message: "PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL must be a valid email address",
    });
  }
  const normalizedName = name.trim();
  if (!normalizedName) {
    return yield* new BootstrapAdminConfigurationError({
      message: "PROSEWIRE_BOOTSTRAP_ADMIN_NAME cannot be empty",
    });
  }
  const passwordValue = Redacted.value(password);
  if (
    passwordValue.length < 12 ||
    passwordValue.length > 128 ||
    knownPlaceholderPasswords.has(passwordValue)
  ) {
    return yield* new BootstrapAdminConfigurationError({
      message:
        "PROSEWIRE_BOOTSTRAP_ADMIN_PASSWORD must be a unique value between 12 and 128 characters",
    });
  }

  return {
    email,
    name: normalizedName,
    password,
  } satisfies BootstrapAdminConfig;
});

export async function bootstrapAdmin(
  databaseUrl: string,
  config: BootstrapAdminConfig,
): Promise<BootstrapAdminResult> {
  const database = openDb(databaseUrl);
  try {
    return await database.client.transaction(async (transaction) => {
      const users = await transaction
        .select({
          id: schema.user.id,
          email: schema.user.email,
          role: schema.user.role,
          mustChangePassword: schema.user.mustChangePassword,
        })
        .from(schema.user)
        .limit(2);
      const workspaces = await transaction
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .limit(1);
      const existing = users[0];
      const canRefresh =
        users.length === 1 &&
        workspaces.length === 0 &&
        existing?.email === config.email &&
        existing.role === "admin" &&
        existing.mustChangePassword;

      if (users.length > 0 && !canRefresh) {
        return "skipped-existing-installation";
      }
      if (workspaces.length > 0) {
        return "skipped-existing-installation";
      }

      const password = await hashPassword(Redacted.value(config.password));
      if (existing && canRefresh) {
        const credentialAccounts = await transaction
          .select({ id: schema.account.id })
          .from(schema.account)
          .where(
            and(
              eq(schema.account.userId, existing.id),
              eq(schema.account.providerId, "credential"),
              eq(schema.account.issuer, "local:credential"),
            ),
          )
          .limit(1);
        const credential = credentialAccounts[0];
        if (credential) {
          await transaction
            .update(schema.account)
            .set({ password, updatedAt: new Date() })
            .where(eq(schema.account.id, credential.id));
        } else {
          await transaction.insert(schema.account).values({
            id: randomUUID(),
            userId: existing.id,
            accountId: existing.id,
            providerId: "credential",
            issuer: "local:credential",
            password,
          });
        }
        await transaction
          .update(schema.user)
          .set({ name: config.name, updatedAt: new Date() })
          .where(eq(schema.user.id, existing.id));
        return "refreshed";
      }

      const userId = randomUUID();
      await transaction.insert(schema.user).values({
        id: userId,
        email: config.email,
        emailVerified: true,
        name: config.name,
        role: "admin",
        mustChangePassword: true,
      });
      await transaction.insert(schema.account).values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        issuer: "local:credential",
        password,
      });
      return "created";
    });
  } finally {
    await database.close();
  }
}
