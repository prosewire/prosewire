import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";
import type { PortableImportInput } from "./index.ts";

/** Stream the existing two export artifacts into one envelope, without unpacking them. */
export function openPortableImportFile(
  file: string,
  mediaFile?: string,
): Pick<PortableImportInput, "body" | "contentType"> {
  if (!mediaFile)
    return {
      body: Readable.toWeb(
        createReadStream(file),
      ) as ReadableStream<Uint8Array>,
      contentType: file.toLowerCase().endsWith(".zip")
        ? "application/zip"
        : "application/json",
    };
  const mediaSource = mediaFile;
  async function* chunks() {
    const output: Uint8Array[] = [];
    let failure: Error | undefined;
    const archive = new Zip((error, chunk) => {
      if (error) failure = error;
      else output.push(chunk);
    });
    const drain = function* () {
      if (failure) throw failure;
      yield* output.splice(0);
    };
    try {
      for (const [name, source] of [
        ["export.json", file],
        ["media.zip", mediaSource],
      ] as const) {
        const entry = new ZipPassThrough(name);
        archive.add(entry);
        yield* drain();
        for await (const chunk of createReadStream(source)) {
          entry.push(chunk, false);
          yield* drain();
        }
        entry.push(new Uint8Array(), true);
        yield* drain();
      }
      archive.end();
      yield* drain();
    } finally {
      archive.terminate();
    }
  }
  return {
    contentType: "application/zip",
    body: Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>,
  };
}
