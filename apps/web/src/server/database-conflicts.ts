import { Predicate } from "effect";

const conflictMessages: Readonly<Record<string, string>> = {
  post_blog_slug_unique:
    "A post with this slug already exists in this publication",
  blog_slug_unique: "A publication with this slug already exists",
  organization_slug_unique: "A workspace with this slug already exists",
  author_blog_slug_unique:
    "An author with this slug already exists in this publication",
  category_blog_slug_unique:
    "A category with this slug already exists in this publication",
  snippet_blog_key_unique:
    "A snippet with this key already exists in this publication",
  redirect_blog_path_unique: "This URL already redirects to another post",
  member_organization_user_unique: "This user already belongs to the workspace",
  invitation_pending_email_unique:
    "This email already has a pending invitation",
};

export function databaseConflictMessage(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (Predicate.isObject(error) && !seen.has(error)) {
    seen.add(error);
    if (error["code"] === "23505" && typeof error["constraint"] === "string") {
      return conflictMessages[error["constraint"]];
    }
    error = error["cause"];
  }
  return undefined;
}
