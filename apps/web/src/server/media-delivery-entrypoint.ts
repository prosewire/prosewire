import { Effect } from "effect";
import { requireSessionWithHeadersEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { decodeErrorTag } from "./boundary-errors.ts";
import { UserId } from "./domain.ts";
import { MediaDelivery } from "./media-delivery.ts";

export async function deliverMedia(request: Request, key: string) {
  const location = await runAppEffect(
    Effect.gen(function* () {
      const delivery = yield* MediaDelivery.Service;
      const method = request.method === "HEAD" ? "HEAD" : "GET";
      const reader = request.headers.has("cookie")
        ? requireSessionWithHeadersEffect(request.headers).pipe(
            Effect.map((session) => UserId.make(session.user.id)),
          )
        : Effect.succeed(null);
      const variant = yield* delivery.resolve(key, reader);
      return variant ? yield* variant.signedUrl(method) : null;
    }).pipe(
      Effect.catchTags({
        AuthenticationRequired: () => Effect.succeed(null),
        PasswordChangeRequired: () => Effect.succeed(null),
      }),
      Effect.catch((error) =>
        Effect.sync(() => {
          console.error("Media delivery failed", {
            errorTag: decodeErrorTag(error) ?? "Unknown",
          });
          return undefined;
        }),
      ),
    ),
    request.signal,
  ).catch(() => {
    console.error("Media runtime unavailable");
    return undefined;
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (location === undefined)
    return new Response(null, { status: 503, headers });
  if (location === null) return new Response(null, { status: 404, headers });
  // The URL carries a short-lived credential. Never cache or log this redirect.
  headers.set("Location", location);
  return new Response(null, { status: 302, headers });
}
