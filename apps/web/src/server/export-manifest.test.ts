import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Stream } from "effect";
import { expect, it } from "vitest";
import { temporaryManifest } from "./export-manifest.ts";
import { responseBody } from "./export-streams.ts";

it("removes the spooled manifest when a download stops", async () => {
  const root = await mkdtemp(join(tmpdir(), "prosewire-manifest-test-"));
  try {
    const stream = Stream.unwrap(
      Effect.gen(function* () {
        const file = yield* temporaryManifest(root);
        yield* file.append(new TextEncoder().encode("first"));
        yield* file.append(new TextEncoder().encode("second"));
        return file.body;
      }),
    );
    const reader = responseBody(
      stream,
      new AbortController().signal,
    ).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      "firstsecond",
    );
    await reader.cancel();
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
