import { Schema } from "effect";

export const PostId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/PostId"),
);
export type PostId = typeof PostId.Type;

export class PublishedPost extends Schema.Class<PublishedPost>(
  "Publishing.PublishedPost",
)({
  id: PostId,
  title: Schema.String,
}) {}

export * as WorkerDomain from "./domain.js";
