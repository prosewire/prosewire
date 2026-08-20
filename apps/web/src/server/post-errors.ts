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

export type Error = PostNotFound | InvalidPost;

export * as PostErrors from "./post-errors";
