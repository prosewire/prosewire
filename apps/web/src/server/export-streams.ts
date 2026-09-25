import { Effect, Schema, Stream } from "effect";
import { Zip, ZipPassThrough } from "fflate";

export class ExportEncodingError extends Schema.TaggedError<ExportEncodingError>()(
  "ExportEncodingError",
  { cause: Schema.Defect() },
) {}

export const concat = <A, E>(...streams: ReadonlyArray<Stream.Stream<A, E>>) =>
  Stream.fromIterable(streams).pipe(Stream.flatten);
export const json = (value: unknown) => Stream.make(JSON.stringify(value));
export const jsonArray = <E>(
  items: Stream.Stream<Stream.Stream<string, E>, E>,
) =>
  concat(
    Stream.make("["),
    items.pipe(Stream.intersperse(Stream.make(",")), Stream.flatten),
    Stream.make("]"),
  );
export const jsonObject = <E>(
  fields: Readonly<Record<string, Stream.Stream<string, E>>>,
) =>
  concat(
    Stream.make("{"),
    Stream.fromIterable(Object.entries(fields)).pipe(
      Stream.map(([key, value]) =>
        concat(Stream.make(`${JSON.stringify(key)}:`), value),
      ),
      Stream.intersperse(Stream.make(",")),
      Stream.flatten,
    ),
    Stream.make("}"),
  );
export const encode = <E>(text: Stream.Stream<string, E>) =>
  text.pipe(Stream.map((chunk) => new TextEncoder().encode(chunk)));

/** fflate emits synchronously: only the chunks from the current input push are queued. */
export const zip = <E>(
  entries: Stream.Stream<
    { readonly name: string; readonly body: Stream.Stream<Uint8Array, E> },
    E
  >,
) =>
  Stream.unwrap(
    Effect.sync(() => {
      const output: Array<Uint8Array> = [];
      let failure: Error | null = null;
      const archive = new Zip((error, chunk) => {
        if (error) failure = error;
        else output.push(chunk);
      });
      const drain = (write: () => void) =>
        Stream.fromEffect(
          Effect.try({
            try: () => {
              write();
              if (failure) throw failure;
              return output.splice(0);
            },
            catch: (cause) => new ExportEncodingError({ cause }),
          }),
        ).pipe(Stream.flatMap(Stream.fromIterable));
      const files = entries.pipe(
        Stream.flatMap((entry) => {
          const file = new ZipPassThrough(entry.name);
          return concat(
            drain(() => archive.add(file)),
            entry.body.pipe(
              Stream.flatMap((chunk) => drain(() => file.push(chunk, false))),
            ),
            drain(() => file.push(new Uint8Array(), true)),
          );
        }),
      );
      return concat(
        files,
        drain(() => archive.end()),
      ).pipe(Stream.ensuring(Effect.sync(() => archive.terminate())));
    }),
  );

export function responseBody<E>(
  body: Stream.Stream<Uint8Array, E>,
  signal: AbortSignal,
) {
  const aborted = Effect.callback<never>((resume) => {
    const interrupt = () => resume(Effect.interrupt);
    if (signal.aborted) interrupt();
    else signal.addEventListener("abort", interrupt, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", interrupt));
  });
  return Stream.toReadableStream(
    body.pipe(
      Stream.tapError((error) =>
        Effect.logError("Publication export stream failed", error),
      ),
      Stream.interruptWhen(aborted),
    ),
    {
      strategy: { highWaterMark: 0 },
    },
  );
}
