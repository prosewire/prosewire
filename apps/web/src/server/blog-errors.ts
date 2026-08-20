import { Schema } from "effect";
import { BlogId } from "./domain.ts";

export class BlogNotFound extends Schema.TaggedError<BlogNotFound>()(
  "BlogNotFound",
  { blogId: BlogId },
) {
  override get message(): string {
    return `Blog ${this.blogId} was not found`;
  }
}

export type Error = BlogNotFound;

export * as BlogErrors from "./blog-errors";
