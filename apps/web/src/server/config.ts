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

export type ProsewireDeployment = "self-hosted" | "cloud";

export interface MediaStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: Redacted.Redacted<string>;
  readonly secretAccessKey: Redacted.Redacted<string>;
  readonly publicUrl: string;
  readonly forcePathStyle: boolean;
  readonly maxUploadBytes: number;
  readonly uploadUrlExpiresSeconds: number;
  readonly backupBucket?: string;
}

const localDevelopmentAuthSecret =
  "local-development-secret-change-before-production";
const knownPlaceholderAuthSecrets = new Set([
  localDevelopmentAuthSecret,
  "please-change-this-to-at-least-32-characters",
  "replace-with-a-unique-secret-of-at-least-32-characters",
  "replace-with-at-least-32-random-characters",
]);

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

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
  readonly deployment: ProsewireDeployment;
  readonly environment: string;
  readonly mediaStorage?: MediaStorageConfig;
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
      const mediaEndpoint = yield* Config.option(
        Config.string("PROSEWIRE_MEDIA_ENDPOINT"),
      );
      const mediaBucket = yield* Config.option(
        Config.string("PROSEWIRE_MEDIA_BUCKET"),
      );
      const mediaAccessKeyId = yield* Config.option(
        Config.redacted("PROSEWIRE_MEDIA_ACCESS_KEY_ID"),
      );
      const mediaSecretAccessKey = yield* Config.option(
        Config.redacted("PROSEWIRE_MEDIA_SECRET_ACCESS_KEY"),
      );
      const mediaPublicUrl = yield* Config.option(
        Config.string("PROSEWIRE_MEDIA_PUBLIC_URL"),
      );
      const mediaRegion = yield* Config.string("PROSEWIRE_MEDIA_REGION").pipe(
        Config.withDefault("auto"),
      );
      const mediaForcePathStyle = yield* Config.boolean(
        "PROSEWIRE_MEDIA_FORCE_PATH_STYLE",
      ).pipe(Config.withDefault(false));
      const mediaMaxUploadBytes = yield* Config.int(
        "PROSEWIRE_MEDIA_MAX_UPLOAD_BYTES",
      ).pipe(Config.withDefault(20 * 1_024 * 1_024));
      const mediaUploadUrlExpiresSeconds = yield* Config.int(
        "PROSEWIRE_MEDIA_UPLOAD_URL_EXPIRES_SECONDS",
      ).pipe(Config.withDefault(600));
      const mediaBackupBucket = yield* Config.option(
        Config.string("PROSEWIRE_MEDIA_BACKUP_BUCKET"),
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

      const mediaParts = [
        Option.isSome(mediaEndpoint),
        Option.isSome(mediaBucket),
        Option.isSome(mediaAccessKeyId),
        Option.isSome(mediaSecretAccessKey),
        Option.isSome(mediaPublicUrl),
      ];
      const configuredMediaParts = mediaParts.filter(Boolean).length;
      if (
        configuredMediaParts !== 0 &&
        configuredMediaParts !== mediaParts.length
      ) {
        return yield* new ConfigurationError({
          message:
            "PROSEWIRE_MEDIA_ENDPOINT, PROSEWIRE_MEDIA_BUCKET, PROSEWIRE_MEDIA_ACCESS_KEY_ID, PROSEWIRE_MEDIA_SECRET_ACCESS_KEY, and PROSEWIRE_MEDIA_PUBLIC_URL must be configured together",
        });
      }
      if (deployment === "cloud" && configuredMediaParts === 0) {
        return yield* new ConfigurationError({
          message: "Cloud deployments require Prosewire media storage",
        });
      }
      if (
        mediaMaxUploadBytes < 1 ||
        mediaMaxUploadBytes > 100 * 1_024 * 1_024
      ) {
        return yield* new ConfigurationError({
          message:
            "PROSEWIRE_MEDIA_MAX_UPLOAD_BYTES must be between 1 and 104857600",
        });
      }
      if (
        mediaUploadUrlExpiresSeconds < 60 ||
        mediaUploadUrlExpiresSeconds > 3_600
      ) {
        return yield* new ConfigurationError({
          message:
            "PROSEWIRE_MEDIA_UPLOAD_URL_EXPIRES_SECONDS must be between 60 and 3600",
        });
      }

      let mediaStorage: MediaStorageConfig | undefined;
      if (
        Option.isSome(mediaEndpoint) &&
        Option.isSome(mediaBucket) &&
        Option.isSome(mediaAccessKeyId) &&
        Option.isSome(mediaSecretAccessKey) &&
        Option.isSome(mediaPublicUrl)
      ) {
        if (
          !isHttpUrl(mediaEndpoint.value) ||
          !isHttpUrl(mediaPublicUrl.value)
        ) {
          return yield* new ConfigurationError({
            message:
              "PROSEWIRE_MEDIA_ENDPOINT and PROSEWIRE_MEDIA_PUBLIC_URL must be valid HTTP(S) URLs",
          });
        }
        mediaStorage = {
          endpoint: mediaEndpoint.value.replace(/\/$/, ""),
          region: mediaRegion,
          bucket: mediaBucket.value,
          accessKeyId: mediaAccessKeyId.value,
          secretAccessKey: mediaSecretAccessKey.value,
          publicUrl: mediaPublicUrl.value.replace(/\/$/, ""),
          forcePathStyle: mediaForcePathStyle,
          maxUploadBytes: mediaMaxUploadBytes,
          uploadUrlExpiresSeconds: mediaUploadUrlExpiresSeconds,
          ...(Option.isSome(mediaBackupBucket)
            ? { backupBucket: mediaBackupBucket.value }
            : {}),
        };
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
        deployment,
        environment,
        ...(mediaStorage ? { mediaStorage } : {}),
        ...(cloudSocialProviders ? { cloudSocialProviders } : {}),
      };
    }),
  );
}

export * as WebConfiguration from "./config";
