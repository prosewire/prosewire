import { Effect } from "effect";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MediaImage } from "./media-image.ts";

async function png(width = 2_000, height = 1_000): Promise<Uint8Array> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 239, g: 104, b: 72, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("MediaImage", () => {
  it("detects, sanitizes, and sizes every cover variant", async () => {
    const body = await png();
    const result = await Effect.runPromise(
      MediaImage.live.process(body, "image/png"),
    );

    expect(result).toMatchObject({
      detectedMimeType: "image/png",
      width: 2_000,
      height: 1_000,
    });
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.variants.map(({ kind }) => kind)).toEqual([
      "original",
      "large",
      "thumbnail",
    ]);
    expect(result.variants[0]).toMatchObject({
      mimeType: "image/png",
      width: 2_000,
      height: 1_000,
    });
    expect(result.variants[1]).toMatchObject({
      mimeType: "image/webp",
      width: 1_600,
      height: 800,
    });
    expect(result.variants[2]).toMatchObject({
      mimeType: "image/webp",
      width: 480,
      height: 240,
    });
    for (const variant of result.variants) {
      expect(variant.byteSize).toBe(variant.body.byteLength);
      expect(variant.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("rejects a declared MIME type that does not match the file", async () => {
    const error = await Effect.runPromise(
      Effect.flip(MediaImage.live.process(await png(20, 20), "image/jpeg")),
    );

    expect(error).toMatchObject({
      _tag: "MediaInvalidImage",
      message: "The file contains image/png, not image/jpeg",
    });
  });

  it("rejects non-image input", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        MediaImage.live.process(
          new TextEncoder().encode("not an image"),
          "image/png",
        ),
      ),
    );

    expect(error).toMatchObject({
      _tag: "MediaInvalidImage",
      message: "The upload is not a readable supported image",
    });
  });
});
