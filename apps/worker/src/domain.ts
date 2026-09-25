import { PostId } from "@prosewire/contract/domain";
import { Schema } from "effect";

export { PostId } from "@prosewire/contract/domain";

export class PublishedPost extends Schema.Class<PublishedPost>(
  "Publishing.PublishedPost",
)({
  id: PostId,
  title: Schema.String,
}) {}

export * as WorkerDomain from "./domain.js";
