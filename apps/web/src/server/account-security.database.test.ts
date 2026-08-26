import * as schema from "@prosewire/db/schema";
import { openTestDatabase } from "@prosewire/db/testing";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { Effect, Layer, ManagedRuntime, Result } from "effect";
import { describe, expect, it } from "vitest";
import { AccountSecurity } from "./account-security.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import { UserId } from "./domain.ts";

describe.skipIf(!databaseUrl)("required bootstrap password change", () => {
  it("changes the credential, clears the gate, and revokes sessions", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const database = await openTestDatabase(
      databaseUrl,
      "required_password_change",
    );
    const runtime = ManagedRuntime.make(
      AccountSecurity.layer.pipe(Layer.provide(databaseLayer(database.client))),
    );
    const userId = UserId.make("bootstrap-user");
    const temporaryPassword = "temporary-password-123";

    try {
      const temporaryHash = await hashPassword(temporaryPassword);
      await database.client.transaction(async (transaction) => {
        await transaction.insert(schema.user).values({
          id: userId,
          email: "owner@example.com",
          name: "Initial owner",
          role: "admin",
          mustChangePassword: true,
        });
        await transaction.insert(schema.account).values({
          id: "credential-1",
          userId,
          accountId: userId,
          providerId: "credential",
          issuer: "local:credential",
          password: temporaryHash,
        });
        await transaction.insert(schema.session).values([
          {
            id: "session-1",
            userId,
            token: "token-1",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          },
          {
            id: "session-2",
            userId,
            token: "token-2",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          },
        ]);
      });
      const service = await runtime.runPromise(AccountSecurity.Service);
      const wrongPassword = await runtime.runPromise(
        Effect.result(
          service.changeRequiredPassword(
            new AccountSecurity.ChangeRequiredPasswordInput({
              currentPassword: "incorrect-password",
              newPassword: "private-password-456",
            }),
            userId,
          ),
        ),
      );
      expect(Result.isFailure(wrongPassword)).toBe(true);

      await runtime.runPromise(
        service.changeRequiredPassword(
          new AccountSecurity.ChangeRequiredPasswordInput({
            currentPassword: temporaryPassword,
            newPassword: "private-password-456",
          }),
          userId,
        ),
      );

      const [user, account, sessions] = await Promise.all([
        database.client.query.user.findFirst(),
        database.client.query.account.findFirst(),
        database.client.query.session.findMany(),
      ]);
      expect(user?.mustChangePassword).toBe(false);
      expect(sessions).toHaveLength(0);
      expect(account?.password).toBeTruthy();
      expect(
        account?.password &&
          (await verifyPassword({
            hash: account.password,
            password: "private-password-456",
          })),
      ).toBe(true);
    } finally {
      await runtime.dispose();
      await database.close();
    }
  });
});
