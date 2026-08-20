import { Clock, Context, Crypto, Effect, Layer, Schema } from "effect";
import { eq } from "drizzle-orm";
import * as schema from "@prosewire/db/schema";
import { Database, type DatabaseError } from "./database.ts";
import { ApiKeyId, BlogId } from "./domain.ts";

export const Scope = Schema.Literals(["content:read", "content:write"]);
export type Scope = typeof Scope.Type;

export class Principal extends Schema.Class<Principal>("ApiAccess.Principal")({
  blogId: BlogId,
  keyId: ApiKeyId,
  scopes: Schema.Array(Scope),
}) {}

export class AuthenticationFailed extends Schema.TaggedError<AuthenticationFailed>()(
  "ApiAuthenticationFailed",
  { message: Schema.String },
) {}

export class ScopeDenied extends Schema.TaggedError<ScopeDenied>()(
  "ApiScopeDenied",
  { requiredScope: Scope },
) {
  override get message(): string {
    return `API key requires the ${this.requiredScope} scope`;
  }
}

export class BlogDenied extends Schema.TaggedError<BlogDenied>()(
  "ApiBlogDenied",
  {
    keyId: ApiKeyId,
    authorizedBlogId: BlogId,
    requestedBlogId: BlogId,
  },
) {
  override get message(): string {
    return `API key ${this.keyId} cannot access blog ${this.requestedBlogId}`;
  }
}

export type Error =
  | DatabaseError
  | AuthenticationFailed
  | ScopeDenied
  | BlogDenied;

export function hasScope(
  scopes: ReadonlyArray<string>,
  requiredScope: Scope,
): boolean {
  return scopes.includes(requiredScope);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const create = Effect.fn("ApiAccess.create")(function* () {
  const database = yield* Database;
  const crypto = yield* Crypto.Crypto;

  return {
    authenticate: Effect.fn("ApiAccess.authenticate")(function* (
      token: string | undefined,
      requiredScope: Scope,
    ) {
      if (!token) {
        return yield* new AuthenticationFailed({
          message: "Bearer API key required",
        });
      }
      const digest = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(token))
        .pipe(Effect.orDie);
      const hash = hex(digest);
      const key = yield* database.execute("apiKey.find", (client) =>
        client.query.apiKey.findFirst({
          where: eq(schema.apiKey.keyHash, hash),
        }),
      );
      const now = new Date(yield* Clock.currentTimeMillis);
      if (!key || (key.expiresAt && key.expiresAt <= now)) {
        return yield* new AuthenticationFailed({
          message: "Invalid or expired API key",
        });
      }
      if (!hasScope(key.scopes, requiredScope)) {
        return yield* new ScopeDenied({ requiredScope });
      }
      return new Principal({
        blogId: BlogId.make(key.blogId),
        keyId: ApiKeyId.make(key.id),
        scopes: key.scopes.filter(
          (scope): scope is Scope =>
            scope === "content:read" || scope === "content:write",
        ),
      });
    }),
    requireBlog: Effect.fn("ApiAccess.requireBlog")(function* (
      principal: Principal,
      requestedBlogId: BlogId,
    ) {
      if (principal.blogId !== requestedBlogId) {
        return yield* new BlogDenied({
          keyId: principal.keyId,
          authorizedBlogId: principal.blogId,
          requestedBlogId,
        });
      }
      return principal;
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/ApiAccess",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as ApiAccess from "./api-access";
