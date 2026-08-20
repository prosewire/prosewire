import { Effect } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { UserId } from "./domain.ts";
import {
  Publishing,
  type BulkArchiveInput,
  type SavePostInput,
  type UpdateBlogSettingsInput,
} from "./publishing.ts";

const currentActorId = Effect.fn("MutationEntrypoints.currentActorId")(function* () {
  const session = yield* requireDashboardSessionEffect();
  return UserId.make(session.user.id);
});

export function savePost(input: SavePostInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.savePost(input, actorId);
    }),
  );
}

export function bulkArchive(input: BulkArchiveInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.bulkArchive(input, actorId);
    }),
  );
}

export function updateBlogSettings(input: UpdateBlogSettingsInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.updateBlogSettings(input, actorId);
    }),
  );
}

export * as MutationEntrypoints from "./mutation-entrypoints";
