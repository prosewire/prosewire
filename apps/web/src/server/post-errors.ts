import { Schema } from "effect";
import { PostId, PostRevisionId } from "./domain.ts";

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

export class PostRevisionNotFound extends Schema.TaggedError<PostRevisionNotFound>()(
  "PostRevisionNotFound",
  { postId: PostId, revisionId: PostRevisionId },
) {
  override get message(): string {
    return `Revision ${this.revisionId} was not found for post ${this.postId}`;
  }
}

export class InvalidPostRevision extends Schema.TaggedError<InvalidPostRevision>()(
  "InvalidPostRevision",
  { revisionId: PostRevisionId, message: Schema.String },
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

export type Error =
  | PostNotFound
  | InvalidPost
  | PostRevisionNotFound
  | InvalidPostRevision
  | PostRenderingFailed;

export * as PostErrors from "./post-errors";
