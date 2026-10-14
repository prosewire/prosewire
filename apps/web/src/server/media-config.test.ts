import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { WebConfig } from "./config.ts";

const base = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://localhost/test",
  BETTER_AUTH_SECRET: "test-auth-secret-at-least-32-characters",
  PROSEWIRE_DEPLOYMENT: "cloud",
  PROSEWIRE_MEDIA_DELIVERY: "signed",
  PROSEWIRE_PUBLIC_URL: "https://cloud.example.com/",
  PROSEWIRE_MEDIA_ENDPOINT: "https://storage.example.com",
  PROSEWIRE_MEDIA_BUCKET: "media",
  PROSEWIRE_MEDIA_ACCESS_KEY_ID: "test",
  PROSEWIRE_MEDIA_SECRET_ACCESS_KEY: "test",
};

const resolve = (values: Record<string, string>) =>
  Effect.runPromise(
    WebConfig.pipe(
      Effect.provide(WebConfig.layer),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(values),
      ),
    ),
  );

describe("private bucket configuration", () => {
  it("derives signed delivery URLs without a public bucket URL", async () => {
    const config = await resolve(base);
    expect(config.mediaStorage?.delivery).toBe("signed");
    expect(config.mediaStorage?.publicUrl).toBe(
      "https://cloud.example.com/media",
    );
  });
  it("requires an explicit origin before URLs can be persisted", async () => {
    const { PROSEWIRE_PUBLIC_URL: _, ...missing } = base;
    await expect(resolve(missing)).rejects.toThrow("explicit HTTP(S)");
    await expect(
      resolve({ ...base, PROSEWIRE_PUBLIC_URL: "file:///tmp" }),
    ).rejects.toThrow("explicit HTTP(S)");
  });
  it("rejects mixed delivery modes and incomplete credentials", async () => {
    await expect(
      resolve({
        ...base,
        PROSEWIRE_MEDIA_PUBLIC_URL: "https://cdn.example.com",
      }),
    ).rejects.toThrow("unset PROSEWIRE_MEDIA_PUBLIC_URL");
    const { PROSEWIRE_MEDIA_BUCKET: _, ...missing } = base;
    await expect(resolve(missing)).rejects.toThrow("all four S3");
  });
});
