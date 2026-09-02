import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { type MediaStorageConfig, WebConfig } from "./config.ts";

export class NotConfigured extends Schema.TaggedError<NotConfigured>()(
  "MediaStorageNotConfigured",
  { message: Schema.String },
) {}

export class StorageError extends Schema.TaggedError<StorageError>()(
  "MediaObjectStorageError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Media object storage failed during ${this.operation}`;
  }
}

export interface StoredObjectHead {
  readonly byteSize: number;
  readonly contentType: string | undefined;
}

export interface UploadTarget {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface Shape {
  readonly configured: boolean;
  readonly maxUploadBytes: number;
  readonly uploadUrlExpiresSeconds: number;
  readonly publicUrl: (key: string) => string;
  readonly createUploadTarget: (
    key: string,
    contentType: string,
    byteSize: number,
  ) => Effect.Effect<UploadTarget, NotConfigured | StorageError>;
  readonly head: (
    key: string,
  ) => Effect.Effect<StoredObjectHead, NotConfigured | StorageError>;
  readonly get: (
    key: string,
  ) => Effect.Effect<Uint8Array, NotConfigured | StorageError>;
  readonly put: (
    key: string,
    contentType: string,
    body: Uint8Array,
  ) => Effect.Effect<void, NotConfigured | StorageError>;
  readonly delete: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, NotConfigured | StorageError>;
}

export class Service extends Context.Service<Service, Shape>()(
  "@prosewire/web/ObjectStorage",
) {}

const unavailable = () =>
  new NotConfigured({
    message: "Media storage is not configured for this deployment",
  });

export const disabled: Shape = {
  configured: false,
  maxUploadBytes: 0,
  uploadUrlExpiresSeconds: 0,
  publicUrl: () => "",
  createUploadTarget: () => Effect.fail(unavailable()),
  head: () => Effect.fail(unavailable()),
  get: () => Effect.fail(unavailable()),
  put: () => Effect.fail(unavailable()),
  delete: () => Effect.fail(unavailable()),
};

function storageError(operation: string, cause: unknown): StorageError {
  return new StorageError({ operation, cause });
}

function batches<T>(values: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const result: Array<Array<T>> = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

export function make(
  config: MediaStorageConfig,
  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: Redacted.value(config.accessKeyId),
      secretAccessKey: Redacted.value(config.secretAccessKey),
    },
  }),
): Shape {
  const request = <A>(
    operation: string,
    run: () => Promise<A>,
  ): Effect.Effect<A, StorageError> =>
    Effect.tryPromise({
      try: run,
      catch: (cause) => storageError(operation, cause),
    });

  const deleteFromBucket = (
    bucket: string,
    keys: ReadonlyArray<string>,
    operation: string,
  ) =>
    Effect.forEach(
      batches([...new Set(keys)], 1_000),
      (batch) =>
        request(operation, () =>
          client
            .send(
              new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                  Objects: batch.map((Key) => ({ Key })),
                  Quiet: true,
                },
              }),
            )
            .then((output) => {
              if (output.Errors?.length) {
                throw new Error(
                  output.Errors.map(
                    (error) => error.Message ?? error.Code,
                  ).join(", "),
                );
              }
            }),
        ),
      { concurrency: 3, discard: true },
    );

  return {
    configured: true,
    maxUploadBytes: config.maxUploadBytes,
    uploadUrlExpiresSeconds: config.uploadUrlExpiresSeconds,
    publicUrl: (key) =>
      `${config.publicUrl}/${key
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`,
    createUploadTarget: (key, contentType, byteSize) =>
      request("sign upload", async () => ({
        url: await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            ContentType: contentType,
            ContentLength: byteSize,
          }),
          { expiresIn: config.uploadUrlExpiresSeconds },
        ),
        headers: { "content-type": contentType },
      })),
    head: (key) =>
      request("inspect upload", async () => {
        const output = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (output.ContentLength === undefined) {
          throw new Error("Object storage omitted Content-Length");
        }
        return {
          byteSize: output.ContentLength,
          contentType: output.ContentType,
        };
      }),
    get: (key) =>
      request("read object", async () => {
        const output = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!output.Body) throw new Error("Object storage returned no body");
        return output.Body.transformToByteArray();
      }),
    put: (key, contentType, body) =>
      request("write processed object", () =>
        client
          .send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: key,
              ContentType: contentType,
              ContentLength: body.byteLength,
              Body: body,
              CacheControl: "public, max-age=3600, must-revalidate",
            }),
          )
          .then(() => undefined),
      ),
    delete: (keys) => deleteFromBucket(config.bucket, keys, "delete objects"),
  };
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* WebConfig;
    if (!config.mediaStorage) return Service.of(disabled);
    const client = new S3Client({
      endpoint: config.mediaStorage.endpoint,
      region: config.mediaStorage.region,
      forcePathStyle: config.mediaStorage.forcePathStyle,
      credentials: {
        accessKeyId: Redacted.value(config.mediaStorage.accessKeyId),
        secretAccessKey: Redacted.value(config.mediaStorage.secretAccessKey),
      },
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => client.destroy()));
    return Service.of(make(config.mediaStorage, client));
  }),
);

export * as ObjectStorage from "./object-storage";
