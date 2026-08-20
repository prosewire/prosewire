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

export const OrganizationId = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("@prosewire/OrganizationId"),
);
export type OrganizationId = typeof OrganizationId.Type;

export const OrganizationSlug = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
).pipe(Schema.brand("@prosewire/OrganizationSlug"));
export type OrganizationSlug = typeof OrganizationSlug.Type;

export const MemberId = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("@prosewire/MemberId"),
);
export type MemberId = typeof MemberId.Type;

export const InvitationId = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("@prosewire/InvitationId"),
);
export type InvitationId = typeof InvitationId.Type;

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

export const AuditLogId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/AuditLogId"),
);
export type AuditLogId = typeof AuditLogId.Type;

export const PostRevisionId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/PostRevisionId"),
);
export type PostRevisionId = typeof PostRevisionId.Type;

export const RedirectId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/RedirectId"),
);
export type RedirectId = typeof RedirectId.Type;

export const SnippetId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/SnippetId"),
);
export type SnippetId = typeof SnippetId.Type;

export const PostViewId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@prosewire/PostViewId"),
);
export type PostViewId = typeof PostViewId.Type;

export * as Domain from "./domain";
