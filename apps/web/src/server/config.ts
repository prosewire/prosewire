import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "ConfigurationError",
  { message: Schema.String },
) {}

export interface WebConfigShape {
  readonly defaultBlog: string;
  readonly publicUrl: string;
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly authSecret: Redacted.Redacted<string>;
}

export class WebConfig extends Context.Service<WebConfig, WebConfigShape>()(
  "@prosewire/web/WebConfig",
) {
  static readonly layer = Layer.effect(
    WebConfig,
    Effect.gen(function* () {
      const defaultBlog = yield* Config.string("PROSEWIRE_DEFAULT_BLOG").pipe(
        Config.withDefault("fieldnotes"),
      );
      const publicUrl = yield* Config.string("PROSEWIRE_PUBLIC_URL").pipe(
        Config.withDefault("http://localhost:3000"),
      );
      const databaseUrl = yield* Config.redacted("DATABASE_URL");
      const authSecret = yield* Config.redacted("BETTER_AUTH_SECRET");

      if (Redacted.value(databaseUrl).trim() === "") {
        return yield* new ConfigurationError({
          message: "DATABASE_URL cannot be empty",
        });
      }

      const authSecretValue = Redacted.value(authSecret);
      if (
        authSecretValue.length < 32 ||
        authSecretValue === "please-change-this-to-at-least-32-characters" ||
        authSecretValue === "replace-with-a-unique-secret-of-at-least-32-characters"
      ) {
        return yield* new ConfigurationError({
          message: "BETTER_AUTH_SECRET must be a unique value of at least 32 characters",
        });
      }

      return { defaultBlog, publicUrl, databaseUrl, authSecret };
    }),
  );
}

export * as WebConfiguration from "./config";
