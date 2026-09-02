import { Option, Schema } from "effect";

const TaggedErrorTag = Schema.Struct({ _tag: Schema.String });

export interface TaggedError {
  readonly _tag: string;
  readonly message: string;
}

export function decodeErrorTag(error: unknown): string | undefined {
  const decoded = Schema.decodeUnknownOption(TaggedErrorTag)(error);
  return Option.isSome(decoded) ? decoded.value._tag : undefined;
}

export function decodeTaggedError(error: unknown): TaggedError | undefined {
  const tag = decodeErrorTag(error);
  if (
    tag === undefined ||
    typeof error !== "object" ||
    error === null ||
    !("message" in error) ||
    typeof error.message !== "string"
  ) {
    return undefined;
  }
  return { _tag: tag, message: error.message };
}
