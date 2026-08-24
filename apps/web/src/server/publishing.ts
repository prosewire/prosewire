import { Context, Effect, Layer } from "effect";
import { PublishingRepository } from "./publishing-repository.ts";

export type { ApiActor } from "./publishing-repository.ts";
export {
  ApiCreatePostInput,
  ApiUpdatePostInput,
  BulkArchiveInput,
  PersistenceError,
  SavePostInput,
  UpdateBlogSettingsInput,
} from "./publishing-repository.ts";

export const create = Effect.fn("Publishing.create")(function* () {
  const repository = yield* PublishingRepository.Service;
  return {
    savePost: repository.savePost,
    bulkArchive: repository.bulkArchive,
    updateBlogSettings: repository.updateBlogSettings,
    createApiPost: repository.createApiPost,
    updateApiPost: repository.updateApiPost,
    archiveApiPost: repository.archiveApiPost,
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
