import { createHash } from "node:crypto";
import { Context, Effect, Layer, Schema } from "effect";
import sharp from "sharp";

export const acceptedImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AcceptedImageMimeType = (typeof acceptedImageMimeTypes)[number];
export type MediaVariantKind = "original" | "large" | "thumbnail";

export class InvalidImage extends Schema.TaggedError<InvalidImage>()(
  "MediaInvalidImage",
  { message: Schema.String },
) {}

export class ProcessingError extends Schema.TaggedError<ProcessingError>()(
  "MediaImageProcessingError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Image processing failed";
  }
}

export interface ProcessedVariant {
  readonly kind: MediaVariantKind;
  readonly extension: string;
  readonly mimeType: AcceptedImageMimeType | "image/webp";
  readonly body: Uint8Array;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
}

export interface ProcessedImage {
  readonly detectedMimeType: AcceptedImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
  readonly variants: ReadonlyArray<ProcessedVariant>;
}

export interface Shape {
  readonly process: (
    body: Uint8Array,
    declaredMimeType: string,
  ) => Effect.Effect<ProcessedImage, InvalidImage | ProcessingError>;
}

export class Service extends Context.Service<Service, Shape>()(
  "@prosewire/web/MediaImage",
) {}

function checksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

const formatDetails = {
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
  avif: { mimeType: "image/avif", extension: "avif" },
} as const;

function originalPipeline(
  body: Uint8Array,
  format: keyof typeof formatDetails,
) {
  const image = sharp(body, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  }).rotate();
  switch (format) {
    case "jpeg":
      return image.jpeg({ quality: 90, mozjpeg: true });
    case "png":
      return image.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "webp":
      return image.webp({ quality: 90 });
    case "avif":
      return image.avif({ quality: 65 });
  }
}

async function variant(
  body: Uint8Array,
  kind: MediaVariantKind,
  width: number,
): Promise<ProcessedVariant> {
  const output = await sharp(body, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width,
      height: width,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return {
    kind,
    extension: "webp",
    mimeType: "image/webp",
    body: output.data,
    byteSize: output.data.byteLength,
    width: output.info.width,
    height: output.info.height,
    checksumSha256: checksum(output.data),
  };
}

export const live: Shape = {
  process: (body, declaredMimeType) =>
    Effect.gen(function* () {
      const metadata = yield* Effect.tryPromise({
        try: () =>
          sharp(body, {
            failOn: "error",
            limitInputPixels: 40_000_000,
          }).metadata(),
        catch: () =>
          new InvalidImage({
            message: "The upload is not a readable supported image",
          }),
      });
      const format = metadata.format as keyof typeof formatDetails | undefined;
      const details = format ? formatDetails[format] : undefined;
      if (!format || !details || !metadata.width || !metadata.height) {
        return yield* new InvalidImage({
          message: "The upload is not a supported image",
        });
      }
      if (details.mimeType !== declaredMimeType) {
        return yield* new InvalidImage({
          message: `The file contains ${details.mimeType}, not ${declaredMimeType}`,
        });
      }
      if ((metadata.pages ?? 1) !== 1) {
        return yield* new InvalidImage({
          message: "Animated and multi-page images are not supported",
        });
      }

      const [originalOutput, large, thumbnail] = yield* Effect.tryPromise({
        try: async () => {
          const original = await originalPipeline(body, format).toBuffer({
            resolveWithObject: true,
          });
          const [large, thumbnail] = await Promise.all([
            variant(body, "large", 1_600),
            variant(body, "thumbnail", 480),
          ]);
          return [original, large, thumbnail] as const;
        },
        catch: (cause) => new ProcessingError({ cause }),
      });
      const original: ProcessedVariant = {
        kind: "original",
        extension: details.extension,
        mimeType: details.mimeType,
        body: originalOutput.data,
        byteSize: originalOutput.data.byteLength,
        width: originalOutput.info.width,
        height: originalOutput.info.height,
        checksumSha256: checksum(originalOutput.data),
      };
      return {
        detectedMimeType: details.mimeType,
        width: originalOutput.info.width,
        height: originalOutput.info.height,
        checksumSha256: checksum(body),
        variants: [original, large, thumbnail],
      };
    }),
};

export const layer = Layer.succeed(Service, live);

export function isAcceptedImageMimeType(
  value: string,
): value is AcceptedImageMimeType {
  return acceptedImageMimeTypes.includes(value as AcceptedImageMimeType);
}

export * as MediaImage from "./media-image";
