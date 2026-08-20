import { Schema } from "effect";

export const BlogId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/BlogId"),
);
export type BlogId = typeof BlogId.Type;

export const BlogSlug = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
).pipe(Schema.brand("@prosewire/BlogSlug"));
export type BlogSlug = typeof BlogSlug.Type;

export const PostId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/PostId"),
);
export type PostId = typeof PostId.Type;

export const UserId = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("@prosewire/UserId"),
);
export type UserId = typeof UserId.Type;

export const AuthorId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/AuthorId"),
);
export type AuthorId = typeof AuthorId.Type;

export const CategoryId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/CategoryId"),
);
export type CategoryId = typeof CategoryId.Type;

export const ApiKeyId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/ApiKeyId"),
);
export type ApiKeyId = typeof ApiKeyId.Type;

export * as Domain from "./domain";
