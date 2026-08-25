import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import type { SocialProviderId } from "@/lib/auth-providers";

const localDevelopmentAuthSecret =
  "local-development-secret-change-before-production";
const knownPlaceholderAuthSecrets = new Set([
  localDevelopmentAuthSecret,
  "please-change-this-to-at-least-32-characters",
  "replace-with-a-unique-secret-of-at-least-32-characters",
  "replace-with-at-least-32-random-characters",
]);

export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "ConfigurationError",
  { message: Schema.String },
) {}

export interface WebConfigShape {
  readonly defaultBlog: string;
  readonly publicUrl: string;
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly authSecret: Redacted.Redacted<string>;
  readonly allowSignUp: boolean;
  readonly environment: string;
  readonly cloudSocialProviders?: Partial<
    Record<
      SocialProviderId,
      {
        readonly clientId: string;
        readonly clientSecret: Redacted.Redacted<string>;
      }
    >
  >;
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
      const allowSignUp = yield* Config.boolean("PROSEWIRE_ALLOW_SIGN_UP").pipe(
        Config.withDefault(false),
      );
      const environment = yield* Config.string("NODE_ENV").pipe(
        Config.withDefault("development"),
      );
      const deployment = yield* Config.string("PROSEWIRE_DEPLOYMENT").pipe(
        Config.withDefault("self-hosted"),
      );
      const googleClientId = yield* Config.option(
        Config.string("PROSEWIRE_GOOGLE_CLIENT_ID"),
      );
      const googleClientSecret = yield* Config.option(
        Config.redacted("PROSEWIRE_GOOGLE_CLIENT_SECRET"),
      );
      const githubClientId = yield* Config.option(
        Config.string("PROSEWIRE_GITHUB_CLIENT_ID"),
      );
      const githubClientSecret = yield* Config.option(
        Config.redacted("PROSEWIRE_GITHUB_CLIENT_SECRET"),
      );

      if (Redacted.value(databaseUrl).trim() === "") {
        return yield* new ConfigurationError({
          message: "DATABASE_URL cannot be empty",
        });
      }

      if (deployment !== "self-hosted" && deployment !== "cloud") {
        return yield* new ConfigurationError({
          message: "PROSEWIRE_DEPLOYMENT must be either self-hosted or cloud",
        });
      }

      if (
        deployment === "cloud" &&
        Option.isSome(googleClientId) !== Option.isSome(googleClientSecret)
      ) {
        return yield* new ConfigurationError({
          message:
            "PROSEWIRE_GOOGLE_CLIENT_ID and PROSEWIRE_GOOGLE_CLIENT_SECRET must be configured together",
        });
      }

      if (
        deployment === "cloud" &&
        Option.isSome(githubClientId) !== Option.isSome(githubClientSecret)
      ) {
        return yield* new ConfigurationError({
          message:
            "PROSEWIRE_GITHUB_CLIENT_ID and PROSEWIRE_GITHUB_CLIENT_SECRET must be configured together",
        });
      }

      const cloudSocialProviders =
        deployment === "cloud"
          ? {
              ...(Option.isSome(googleClientId) &&
              Option.isSome(googleClientSecret)
                ? {
                    google: {
                      clientId: googleClientId.value,
                      clientSecret: googleClientSecret.value,
                    },
                  }
                : {}),
              ...(Option.isSome(githubClientId) &&
              Option.isSome(githubClientSecret)
                ? {
                    github: {
                      clientId: githubClientId.value,
                      clientSecret: githubClientSecret.value,
                    },
                  }
                : {}),
            }
          : undefined;

      const authSecretValue = Redacted.value(authSecret);
      if (
        authSecretValue.length < 32 ||
        (knownPlaceholderAuthSecrets.has(authSecretValue) &&
          (environment === "production" ||
            authSecretValue !== localDevelopmentAuthSecret))
      ) {
        return yield* new ConfigurationError({
          message:
            "BETTER_AUTH_SECRET must be a unique value of at least 32 characters",
        });
      }

      return {
        defaultBlog,
        publicUrl,
        databaseUrl,
        authSecret,
        allowSignUp,
        environment,
        ...(cloudSocialProviders ? { cloudSocialProviders } : {}),
      };
    }),
  );
}

export * as WebConfiguration from "./config";
