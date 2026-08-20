import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import * as schema from "@prosewire/db/schema";
import { Database, type DatabaseError } from "./database.ts";
import { BlogId, UserId } from "./domain.ts";

export type BlogRole = typeof schema.blogMember.$inferSelect.role;

export class BlogAccessDenied extends Schema.TaggedError<BlogAccessDenied>()(
  "BlogAccessDenied",
  {
    blogId: BlogId,
    userId: UserId,
    capability: Schema.Literals(["read", "post:write", "admin"]),
  },
) {
  override get message(): string {
    return `User ${this.userId} cannot ${this.capability} blog ${this.blogId}`;
  }
}

export type Error = DatabaseError | BlogAccessDenied;

const readRoles: ReadonlySet<BlogRole> = new Set([
  "owner",
  "admin",
  "editor",
  "author",
  "viewer",
]);
const postWriteRoles: ReadonlySet<BlogRole> = new Set([
  "owner",
  "admin",
  "editor",
  "author",
]);
const adminRoles: ReadonlySet<BlogRole> = new Set(["owner", "admin"]);

export const create = Effect.fn("BlogAccess.create")(function* () {
  const database = yield* Database;

  const requireCapability = Effect.fnUntraced(function* (
    blogId: BlogId,
    userId: UserId,
    capability: "read" | "post:write" | "admin",
    allowedRoles: ReadonlySet<BlogRole>,
  ) {
    const membership = yield* database.execute("blogMember.authorize", (client) =>
      client.query.blogMember.findFirst({
        where: and(
          eq(schema.blogMember.blogId, blogId),
          eq(schema.blogMember.userId, userId),
        ),
      }),
    );
    if (!membership || !allowedRoles.has(membership.role)) {
      return yield* new BlogAccessDenied({ blogId, userId, capability });
    }
    return membership;
  });

  return {
    requireRead: Effect.fn("BlogAccess.requireRead")(
      (blogId: BlogId, userId: UserId) =>
        requireCapability(blogId, userId, "read", readRoles),
    ),
    requirePostWrite: Effect.fn("BlogAccess.requirePostWrite")(
      (blogId: BlogId, userId: UserId) =>
        requireCapability(blogId, userId, "post:write", postWriteRoles),
    ),
    requireAdmin: Effect.fn("BlogAccess.requireAdmin")(
      (blogId: BlogId, userId: UserId) =>
        requireCapability(blogId, userId, "admin", adminRoles),
    ),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/BlogAccess",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as BlogAccess from "./authorization";
