import { Context, Effect, Layer } from "effect";
import { PublishingRepository } from "./publishing-repository.ts";

export type { Actor } from "./post-commands.ts";
export {
  ArchivePostsCommand,
  CreatePostCommand,
  PostRevisionSnapshot,
  RestorePostRevisionCommand,
  UpdatePostCommand,
} from "./post-commands.ts";
export {
  PersistenceError,
  UpdateBlogSettingsInput,
} from "./publishing-repository.ts";

export const create = Effect.fn("Publishing.create")(function* () {
  const repository = yield* PublishingRepository.Service;
  return {
    createPost: repository.createPost,
    updatePost: repository.updatePost,
    archivePosts: repository.archivePosts,
    restorePostRevision: repository.restorePostRevision,
    updateBlogSettings: repository.updateBlogSettings,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Publishing",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export const live = layer.pipe(Layer.provide(PublishingRepository.layer));

export * as Publishing from "./publishing";
