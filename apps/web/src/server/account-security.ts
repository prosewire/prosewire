import * as schema from "@prosewire/db/schema";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { Database, type DatabaseError } from "./database.ts";
import type { UserId } from "./domain.ts";
import { promiseEffect } from "./external-effect.ts";

export class InvalidPasswordChange extends Schema.TaggedError<InvalidPasswordChange>()(
  "InvalidPasswordChange",
  { message: Schema.String },
) {}

export class PasswordHashingFailed extends Schema.TaggedError<PasswordHashingFailed>()(
  "PasswordHashingFailed",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Unable to secure the new password";
  }
}

export class ChangeRequiredPasswordInput extends Schema.Class<ChangeRequiredPasswordInput>(
  "AccountSecurity.ChangeRequiredPasswordInput",
)({
  currentPassword: Schema.String,
  newPassword: Schema.String,
}) {}

export const create = Effect.fn("AccountSecurity.create")(function* () {
  const database = yield* Database;

  const changeRequiredPassword = Effect.fn(
    "AccountSecurity.changeRequiredPassword",
  )(function* (input: ChangeRequiredPasswordInput, userId: UserId) {
    if (input.currentPassword.length === 0) {
      return yield* new InvalidPasswordChange({
        message: "Enter the temporary password",
      });
    }
    if (input.newPassword.length < 12 || input.newPassword.length > 128) {
      return yield* new InvalidPasswordChange({
        message: "Use a new password between 12 and 128 characters",
      });
    }
    if (input.newPassword === input.currentPassword) {
      return yield* new InvalidPasswordChange({
        message: "Choose a password different from the temporary password",
      });
    }

    const credential = yield* database.execute(
      "accountSecurity.findCredential",
      (client) =>
        client.query.account.findFirst({
          where: and(
            eq(schema.account.userId, userId),
            eq(schema.account.providerId, "credential"),
            eq(schema.account.issuer, "local:credential"),
          ),
        }),
    );
    if (!credential?.password) {
      return yield* new InvalidPasswordChange({
        message: "This account does not have a password credential",
      });
    }
    const credentialPassword = credential.password;

    const currentPasswordMatches = yield* promiseEffect(
      "accountSecurity.verifyPassword",
      () =>
        verifyPassword({
          hash: credentialPassword,
          password: input.currentPassword,
        }),
      (cause) => new PasswordHashingFailed({ cause }),
    );
    if (!currentPasswordMatches) {
      return yield* new InvalidPasswordChange({
        message: "The temporary password is incorrect",
      });
    }
    const password = yield* promiseEffect(
      "accountSecurity.hashPassword",
      () => hashPassword(input.newPassword),
      (cause) => new PasswordHashingFailed({ cause }),
    );

    const result = yield* database.execute(
      "accountSecurity.changeRequiredPassword",
      (client) =>
        client.transaction(async (transaction) => {
          const forcedUsers = await transaction
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(
              and(
                eq(schema.user.id, userId),
                eq(schema.user.mustChangePassword, true),
              ),
            )
            .for("update");
          if (!forcedUsers[0]) {
            return Result.fail(
              new InvalidPasswordChange({
                message: "This password has already been changed",
              }),
            );
          }
          const updatedCredentials = await transaction
            .update(schema.account)
            .set({ password, updatedAt: new Date() })
            .where(
              and(
                eq(schema.account.id, credential.id),
                eq(schema.account.password, credentialPassword),
              ),
            )
            .returning({ id: schema.account.id });
          if (!updatedCredentials[0]) {
            return Result.fail(
              new InvalidPasswordChange({
                message:
                  "The password changed in another session. Sign in again.",
              }),
            );
          }
          await transaction
            .update(schema.user)
            .set({ mustChangePassword: false, updatedAt: new Date() })
            .where(eq(schema.user.id, userId));
          await transaction
            .delete(schema.session)
            .where(eq(schema.session.userId, userId));
          return Result.succeed(undefined);
        }),
    );
    return yield* Result.match(result, {
      onFailure: Effect.fail,
      onSuccess: Effect.succeed,
    });
  });

  return { changeRequiredPassword };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/AccountSecurity",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export type Error =
  | InvalidPasswordChange
  | PasswordHashingFailed
  | DatabaseError;

export * as AccountSecurity from "./account-security";
