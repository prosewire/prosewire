import { Effect, Stream } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { responseBody, zip } from "./export-streams.ts";

describe("export stream ownership", () => {
  it("applies backpressure and releases sources on reader cancellation", async () => {
    let pulled = 0;
    let closed = false;
    const source = Stream.fromEffectRepeat(
      Effect.sync(() => {
        pulled++;
        return new Uint8Array([pulled]);
      }),
    ).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          closed = true;
        }),
      ),
    );
    const reader = responseBody(
      source,
      new AbortController().signal,
    ).getReader();
    expect(pulled).toBe(0);
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    expect(pulled).toBe(1);
    await reader.cancel();
    expect(closed).toBe(true);
    expect(pulled).toBe(1);
  });

  it("aborts an in-flight source when the HTTP request disconnects", async () => {
    let closed = false;
    const controller = new AbortController();
    const source = Stream.fromEffect(Effect.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          closed = true;
        }),
      ),
    );
    const reader = responseBody(source, controller.signal).getReader();
    const pending = reader.read();
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(closed).toBe(true);
  });

  it("writes a ZIP from multiple chunks without collecting source payloads", async () => {
    const entry = {
      name: "original.txt",
      body: Stream.make(
        new TextEncoder().encode("first"),
        new TextEncoder().encode("second"),
      ),
    };
    const chunks = await Effect.runPromise(
      Stream.runCollect(zip(Stream.make(entry))),
    );
    const archive = unzipSync(Buffer.concat(chunks));
    expect(strFromU8(archive["original.txt"] ?? new Uint8Array())).toBe(
      "firstsecond",
    );
  });
});
