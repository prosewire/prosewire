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

export class InvalidBlogSettings extends Schema.TaggedError<InvalidBlogSettings>()(
  "InvalidBlogSettings",
  { message: Schema.String },
) {}

export type Error = BlogNotFound | InvalidBlogSettings;

export * as BlogErrors from "./blog-errors";
