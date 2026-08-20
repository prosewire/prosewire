import { Effect, Option, Result, Schema } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { BlogAccess } from "./authorization.ts";
import { runAppEffect } from "./app-runtime.ts";
import { Dashboard } from "./dashboard.ts";
import { BlogSlug, PostId, UserId } from "./domain.ts";
import { PublicContent } from "./public-content.ts";
import { SessionErrors } from "./session-errors.ts";

const currentActor = Effect.fn("PageEntrypoints.currentActor")(function* () {
  const session = yield* requireDashboardSessionEffect();
  return { session, actorId: UserId.make(session.user.id) };
});

const parseBlogSlug = (value: string) =>
  Schema.decodeUnknownOption(BlogSlug)(value);

export type DashboardShellResult =
  | {
      readonly _tag: "Success";
      readonly session: Effect.Success<ReturnType<typeof requireDashboardSessionEffect>>;
      readonly blog: Awaited<ReturnType<typeof loadDashboardSettings>>;
    }
  | { readonly _tag: "Unauthorized" }
  | { readonly _tag: "Forbidden" };

export async function loadDashboardShell(): Promise<DashboardShellResult> {
  const result = await runAppEffect(
    Effect.result(
      Effect.gen(function* () {
        const { session, actorId } = yield* currentActor();
        const dashboard = yield* Dashboard.Service;
        const blog = yield* dashboard.shell(actorId);
        return { session, blog };
      }),
    ),
  );
  if (Result.isSuccess(result)) return { _tag: "Success", ...result.success };
  if (result.failure instanceof SessionErrors.AuthenticationRequired) {
    return { _tag: "Unauthorized" };
  }
  if (result.failure instanceof BlogAccess.BlogAccessDenied) return { _tag: "Forbidden" };
  throw result.failure;
}

export function loadDashboardAnalytics() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.analytics(actorId);
    }),
  );
}

export function loadDashboardContentLibrary() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.contentLibrary(actorId);
    }),
  );
}

export function loadDashboardOverview() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.overview(actorId);
    }),
  );
}

export function loadDashboardIntegration() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.integration(actorId);
    }),
  );
}

export function loadDashboardPosts(search?: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.posts(actorId, search);
    }),
  );
}

export function loadDashboardSettings() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.settings(actorId);
    }),
  );
}

export function loadDashboardTeam() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.team(actorId);
    }),
  );
}

export function loadNewPost() {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.newPost(actorId);
    }),
  );
}

export function loadEditPost(id: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const { actorId } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.editPost(actorId, PostId.make(id));
    }),
  );
}

export function loadPublicBlog(
  slug: string,
  options: { readonly search?: string; readonly category?: string } = {},
) {
  const parsed = parseBlogSlug(slug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.blog(parsed.value, options),
    ),
  );
}

export function loadPublicPost(blogSlug: string, postSlug: string) {
  const parsed = parseBlogSlug(blogSlug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.post(parsed.value, postSlug),
    ),
  );
}

export function loadPublicAuthor(blogSlug: string, authorSlug: string) {
  const parsed = parseBlogSlug(blogSlug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.author(parsed.value, authorSlug),
    ),
  );
}

export * as PageEntrypoints from "./page-entrypoints";
