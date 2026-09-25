import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema, Stream } from "effect";

class ManifestIoError extends Schema.TaggedError<ManifestIoError>()(
  "ExportManifestIoError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const io = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new ManifestIoError({ operation, cause }),
  });
const cleanup = (operation: string, run: () => Promise<void>) =>
  io(operation, run).pipe(
    Effect.tapError(() =>
      Effect.logError("Unable to clean up export manifest", { operation }),
    ),
    Effect.ignore,
  );

/** Keep the manifest aligned with the streamed assets without retaining their metadata in memory. */
export const temporaryManifest = Effect.fn("PostExport.temporaryManifest")(
  function* (parentDirectory = tmpdir()) {
    const directory = yield* Effect.acquireRelease(
      io("create directory", () =>
        mkdtemp(join(parentDirectory, "prosewire-export-")),
      ),
      (directory) =>
        cleanup("remove directory", () =>
          rm(directory, { recursive: true, force: true }),
        ),
    );
    const file = yield* Effect.acquireRelease(
      io("open manifest", () => open(join(directory, "manifest.json"), "w+")),
      (file) => cleanup("close manifest", () => file.close()),
    );
    return {
      append: (chunk: Uint8Array) =>
        io("write manifest", () => file.writeFile(chunk)),
      body: Stream.unwrap(
        Effect.sync(() =>
          Stream.fromAsyncIterable<Uint8Array, ManifestIoError>(
            file.createReadStream({ start: 0, autoClose: false }),
            (cause) =>
              new ManifestIoError({ operation: "read manifest", cause }),
          ),
        ),
      ),
    };
  },
);
