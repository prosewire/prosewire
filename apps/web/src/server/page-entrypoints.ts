import { Effect, Option, Result, Schema } from "effect";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { requireDashboardSessionEffect } from "@/lib/session";
import { type AppServices, runAppEffect } from "./app-runtime.ts";
import { decodeErrorTag } from "./boundary-errors.ts";
import { WebConfig } from "./config.ts";
import type { PublicPostOptions } from "./content-queries.ts";
import { Dashboard } from "./dashboard.ts";
import { BlogId, BlogSlug, OrganizationId, PostId, UserId } from "./domain.ts";
import { promiseEffect } from "./external-effect.ts";
import { Media } from "./media.ts";
import { PublicContent } from "./public-content.ts";

export class PageBoundaryError extends Schema.TaggedError<PageBoundaryError>()(
  "PageBoundaryError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const currentActor = Effect.fn("PageEntrypoints.currentActor")(function* () {
  const session = yield* requireDashboardSessionEffect();
  const cookieStore = yield* promiseEffect(
    "next.cookies",
    cookies,
    (cause) => new PageBoundaryError({ operation: "read cookies", cause }),
  );
  const organizationId = Schema.decodeUnknownOption(OrganizationId)(
    session.session.activeOrganizationId,
  );
  const blogId = Schema.decodeUnknownOption(BlogId)(
    cookieStore.get("prosewire-publication")?.value,
  );
  return {
    session,
    actorId: UserId.make(session.user.id),
    selection: {
      ...(Option.isSome(organizationId)
        ? { organizationId: organizationId.value }
        : {}),
      ...(Option.isSome(blogId) ? { blogId: blogId.value } : {}),
    },
  };
});

const parseBlogSlug = (value: string) => Schema.decodeOption(BlogSlug)(value);

export type DashboardPageResult<A> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Unauthorized" }
  | { readonly _tag: "PasswordChangeRequired" }
  | { readonly _tag: "Forbidden" }
  | { readonly _tag: "NeedsOnboarding" };

async function runDashboardPage<A, E extends Error>(
  effect: Effect.Effect<A, E, AppServices>,
): Promise<DashboardPageResult<A>> {
  await io();
  const result = await runAppEffect(Effect.result(effect));
  if (Result.isSuccess(result)) {
    return { _tag: "Success", value: result.success };
  }
  switch (decodeErrorTag(result.failure)) {
    case "AuthenticationRequired":
      return { _tag: "Unauthorized" };
    case "PasswordChangeRequired":
      return { _tag: "PasswordChangeRequired" };
    case "BlogAccessDenied":
    case "WorkspaceAccessDenied":
      return { _tag: "Forbidden" };
    case "NoWorkspaceAvailable":
    case "NoPublicationAvailable":
      return { _tag: "NeedsOnboarding" };
  }
  throw result.failure;
}

export function loadDashboardShell() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { session, actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const config = yield* WebConfig;
      const context = yield* dashboard.shell(actorId, selection);
      return {
        session,
        context,
        blog: context.publication,
        canCreateWorkspace: config.deployment === "cloud",
        showWorkspaceSwitcher:
          config.deployment === "cloud" || context.workspaces.length > 1,
      };
    }),
  );
}

export function loadDashboardAnalytics() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.analytics(actorId, selection);
    }),
  );
}

export function loadDashboardContentLibrary() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const library = yield* dashboard.contentLibrary(actorId, selection);
      const media = yield* Media.Service;
      const assets = yield* media.list(library.blog.id, {
        _tag: "Dashboard",
        userId: actorId,
      });
      return { ...library, media: assets };
    }),
  );
}

export function loadDashboardOverview() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.overview(actorId, selection);
    }),
  );
}

export function loadDashboardIntegration() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.integration(actorId, selection);
    }),
  );
}

export function loadDashboardPosts(search?: string) {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      return yield* dashboard.posts(actorId, selection, search);
    }),
  );
}

export function loadDashboardSettings() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const config = yield* WebConfig;
      const settings = yield* dashboard.settings(actorId, selection);
      return {
        ...settings,
        cloudDeployment: config.deployment === "cloud",
      };
    }),
  );
}

export function loadDashboardTeam() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const config = yield* WebConfig;
      const team = yield* dashboard.team(actorId, selection);
      return { ...team, cloudDeployment: config.deployment === "cloud" };
    }),
  );
}

export function loadDashboardAudit() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const config = yield* WebConfig;
      const audit = yield* dashboard.audit(actorId, selection);
      return { ...audit, cloudDeployment: config.deployment === "cloud" };
    }),
  );
}

export function loadNewPost() {
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const data = yield* dashboard.newPost(actorId, selection);
      const media = yield* Media.Service;
      const assets = yield* media.list(data.blog.id, {
        _tag: "Dashboard",
        userId: actorId,
      });
      return { ...data, media: assets };
    }),
  );
}

export function loadEditPost(id: string) {
  const postId = Schema.decodeOption(PostId)(id);
  if (Option.isNone(postId)) {
    return Promise.resolve<DashboardPageResult<null>>({
      _tag: "Success",
      value: null,
    });
  }
  return runDashboardPage(
    Effect.gen(function* () {
      const { actorId, selection } = yield* currentActor();
      const dashboard = yield* Dashboard.Service;
      const data = yield* dashboard.editPost(actorId, selection, postId.value);
      if (!data) return null;
      const media = yield* Media.Service;
      const assets = yield* media.list(data.blog.id, {
        _tag: "Dashboard",
        userId: actorId,
      });
      return { ...data, media: assets };
    }),
  );
}

export async function loadPublicBlog(
  slug: string,
  options: PublicPostOptions = {},
) {
  const parsed = parseBlogSlug(slug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  await io();
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.blog(parsed.value, options),
    ),
  );
}

export async function loadPublicPost(blogSlug: string, postSlug: string) {
  const parsed = parseBlogSlug(blogSlug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  await io();
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.post(parsed.value, postSlug),
    ),
  );
}

export async function loadPublicRedirect(blogSlug: string, postSlug: string) {
  const parsed = parseBlogSlug(blogSlug);
  if (Option.isNone(parsed)) return Promise.resolve(undefined);
  await io();
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.redirect(parsed.value, postSlug),
    ),
  );
}

export async function loadPublicAuthor(blogSlug: string, authorSlug: string) {
  const parsed = parseBlogSlug(blogSlug);
  if (Option.isNone(parsed)) return Promise.resolve(null);
  await io();
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.author(parsed.value, authorSlug),
    ),
  );
}

export * as PageEntrypoints from "./page-entrypoints";
