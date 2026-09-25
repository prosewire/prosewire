import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option, Result } from "effect";
import { WorkerConfig } from "./worker-config.ts";

const load = (values: Record<string, string>) =>
  WorkerConfig.pipe(
    Effect.provide(WorkerConfig.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        DATABASE_URL: "postgres://localhost/test",
        REDIS_URL: "redis://localhost",
        ...values,
      }),
    ),
  );

describe("worker configuration", () => {
  for (const smtp of [undefined, "", "   "]) {
    it.effect(`rejects production SMTP value ${JSON.stringify(smtp)}`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          load({
            NODE_ENV: "production",
            ...(smtp === undefined ? {} : { SMTP_URL: smtp }),
          }),
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({
            _tag: "WorkerConfigurationError",
            variable: "SMTP_URL",
          });
        }
      }),
    );
  }

  it.effect("loads production SMTP and allows development without SMTP", () =>
    Effect.gen(function* () {
      const production = yield* load({
        NODE_ENV: "production",
        SMTP_URL: "smtp://localhost:2525",
      });
      expect(Option.isSome(production.smtpUrl)).toBe(true);
      const development = yield* load({ NODE_ENV: "development" });
      expect(Option.isNone(development.smtpUrl)).toBe(true);
    }),
  );
});
