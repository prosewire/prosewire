import { ApiImportRejected } from "@prosewire/contract";
import { Effect, Option, Result, Schema } from "effect";
import { ApiAccess } from "./api-access.ts";
import { runAppEffect } from "./app-runtime.ts";
import { decodeTaggedError } from "./boundary-errors.ts";
import { receiveImport } from "./import-files.ts";
import { PortableImport } from "./portable-import.ts";

export async function importPublication(request: Request) {
  const query = new URL(request.url).searchParams;
  const mode = query.get("mode") ?? "preview";
  const preserve = query.get("preserveStates") ?? "false";
  if (
    (mode !== "preview" && mode !== "apply") ||
    !["true", "false"].includes(preserve) ||
    !request.body
  )
    return Response.json(
      {
        _tag: "ApiImportRejected",
        item: "request",
        message:
          "Supply a body, mode preview/apply, and preserveStates true/false",
      },
      { status: 400 },
    );
  const body = request.body;
  const contentType =
    request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  const result = await runAppEffect(
    Effect.scoped(
      Effect.gen(function* () {
        const access = yield* ApiAccess.Service;
        const principal = yield* access.authenticate(
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
          "content:write",
        );
        const files = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => receiveImport(body, contentType),
            catch: (cause) =>
              cause instanceof ApiImportRejected
                ? cause
                : new ApiImportRejected({
                    item: "request",
                    message: "Unable to read import",
                  }),
          }),
          (files) => Effect.promise(files.dispose),
        );
        const importer = yield* PortableImport.Service;
        return yield* importer.run(files, principal, mode, preserve === "true");
      }),
    ).pipe(Effect.result),
    request.signal,
  );
  return importResponse(result);
}
function importResponse(result: Result.Result<unknown, unknown>) {
  if (Result.isSuccess(result)) return Response.json(result.success);
  const itemFailure = Schema.decodeUnknownOption(
    Schema.Struct({
      _tag: Schema.Literals(["ApiImportRejected", "ApiImportConflict"]),
      item: Schema.String,
      message: Schema.String,
    }),
  )(result.failure);
  if (Option.isSome(itemFailure))
    return Response.json(itemFailure.value, {
      status: itemFailure.value._tag === "ApiImportConflict" ? 409 : 400,
    });
  const failure = decodeTaggedError(result.failure);
  if (failure?._tag === "ApiAuthenticationFailed")
    return Response.json(failure, { status: 401 });
  if (failure?._tag === "ApiScopeDenied")
    return Response.json(
      { _tag: "ApiAccessDenied", message: failure.message },
      { status: 403 },
    );
  return Response.json(
    {
      _tag: "ApiUnavailable",
      message: "Unable to complete publication import",
    },
    { status: 500 },
  );
}
