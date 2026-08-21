import { Schema } from "effect";
import { PostId } from "./domain.ts";

export class PostNotFound extends Schema.TaggedError<PostNotFound>()(
  "PostNotFound",
  { postId: PostId },
) {
  override get message(): string {
    return `Post ${this.postId} was not found`;
  }
}

export class InvalidPost extends Schema.TaggedError<InvalidPost>()(
  "InvalidPost",
  { message: Schema.String },
) {}

export class PostRenderingFailed extends Schema.TaggedError<PostRenderingFailed>()(
  "PostRenderingFailed",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Unable to render post content during ${this.operation}`;
  }
}

export type Error = PostNotFound | InvalidPost | PostRenderingFailed;

export * as PostErrors from "./post-errors";
