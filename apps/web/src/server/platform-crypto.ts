import { createHash, randomBytes } from "node:crypto";
import { Crypto, Effect, Layer } from "effect";

const algorithms = {
  "SHA-1": "sha1",
  "SHA-256": "sha256",
  "SHA-384": "sha384",
  "SHA-512": "sha512",
} as const;

export const layer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => randomBytes(size),
    digest: (algorithm, data) =>
      Effect.sync(
        () =>
          new Uint8Array(
            createHash(algorithms[algorithm]).update(data).digest(),
          ),
      ),
  }),
);

export * as PlatformCrypto from "./platform-crypto";
