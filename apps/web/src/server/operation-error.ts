import { Effect } from "effect";

export const operationError =
  <E>(
    make: (input: { readonly operation: string; readonly cause: unknown }) => E,
  ) =>
  (operation: string) =>
    Effect.mapError((cause: unknown) => make({ operation, cause }));
