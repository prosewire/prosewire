import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { schema } from "@prosewire/db";
import { db } from "./db.ts";

let cached: ReturnType<typeof build> | undefined;

function build() {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return betterAuth({
    baseURL: process.env["PROSEWIRE_PUBLIC_URL"] ?? "http://localhost:3000",
    secret,
    trustedOrigins: [process.env["PROSEWIRE_PUBLIC_URL"] ?? "http://localhost:3000"],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "member", input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
  });
}

export function auth(): ReturnType<typeof build> {
  cached ??= build();
  return cached;
}
