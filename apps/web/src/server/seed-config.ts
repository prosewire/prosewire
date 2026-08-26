import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";

export class SeedConfigurationError extends Schema.TaggedError<SeedConfigurationError>()(
  "SeedConfigurationError",
  { message: Schema.String },
) {}

export interface SeedConfigShape {
  readonly adminEmail: string;
  readonly adminPassword: Redacted.Redacted<string>;
  readonly seedApiKey: Option.Option<Redacted.Redacted<string>>;
}

export class SeedConfig extends Context.Service<SeedConfig, SeedConfigShape>()(
  "@prosewire/web/SeedConfig",
) {
  static readonly layer = Layer.effect(
    SeedConfig,
    Effect.gen(function* () {
      const adminEmail = yield* Config.string("ADMIN_EMAIL").pipe(
        Config.withDefault("admin@prosewire.local"),
      );
      const adminPassword = yield* Config.redacted("ADMIN_PASSWORD");
      const seedApiKey = yield* Config.option(
        Config.redacted("PROSEWIRE_SEED_API_KEY"),
      );

      const adminPasswordValue = Redacted.value(adminPassword);
      if (
        adminPasswordValue.length < 12 ||
        adminPasswordValue === "replace-with-a-unique-admin-password"
      ) {
        return yield* new SeedConfigurationError({
          message:
            "ADMIN_PASSWORD must be a unique value of at least 12 characters",
        });
      }

      const seedApiKeyValue = Option.map(seedApiKey, Redacted.value).pipe(
        Option.getOrUndefined,
      );
      if (
        seedApiKeyValue !== undefined &&
        (seedApiKeyValue.length < 24 ||
          seedApiKeyValue === "pw_local_development_key")
      ) {
        return yield* new SeedConfigurationError({
          message:
            "PROSEWIRE_SEED_API_KEY must be a unique value of at least 24 characters",
        });
      }

      return { adminEmail, adminPassword, seedApiKey };
    }),
  );
}

export * as SeedConfiguration from "./seed-config";
