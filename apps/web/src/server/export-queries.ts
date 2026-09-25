import * as schema from "@prosewire/db/schema";
import { and, asc, eq, gt, sum } from "drizzle-orm";
import { Effect, Option, Stream } from "effect";
import type { DatabaseShape } from "./database.ts";
import type { BlogId } from "./domain.ts";

const pageSize = 25;

function pages<A extends { readonly id: string }, E>(
  fetch: (after: string | undefined) => Effect.Effect<ReadonlyArray<A>, E>,
) {
  return Stream.paginate(undefined as string | undefined, (after) =>
    fetch(after).pipe(
      Effect.map(
        (rows) =>
          [
            rows,
            rows.length === pageSize
              ? Option.some(rows.at(-1)?.id)
              : Option.none(),
          ] as const,
      ),
    ),
  );
}

/** Each cursor is stable and every query is scoped to the authorized publication. */
export function exportQueries(database: DatabaseShape, blogId: BlogId) {
  const { execute } = database;
  const posts = pages((after) =>
    execute("export.posts", (client) =>
      client.query.post.findMany({
        where: and(
          eq(schema.post.blogId, blogId),
          after ? gt(schema.post.id, after) : undefined,
        ),
        orderBy: [asc(schema.post.id)],
        limit: pageSize,
        with: { author: true, categories: { with: { category: true } } },
      }),
    ),
  );
  const revisions = (postId: string) =>
    pages((after) =>
      execute("export.revisions", (client) =>
        client.query.postRevision.findMany({
          where: and(
            eq(schema.postRevision.postId, postId),
            after ? gt(schema.postRevision.id, after) : undefined,
          ),
          orderBy: [asc(schema.postRevision.id)],
          limit: pageSize,
        }),
      ),
    );
  const authors = pages((after) =>
    execute("export.authors", (client) =>
      client.query.author.findMany({
        where: and(
          eq(schema.author.blogId, blogId),
          after ? gt(schema.author.id, after) : undefined,
        ),
        orderBy: [asc(schema.author.id)],
        limit: pageSize,
      }),
    ),
  );
  const categories = pages((after) =>
    execute("export.categories", (client) =>
      client.query.category.findMany({
        where: and(
          eq(schema.category.blogId, blogId),
          after ? gt(schema.category.id, after) : undefined,
        ),
        orderBy: [asc(schema.category.id)],
        limit: pageSize,
      }),
    ),
  );
  const snippets = pages((after) =>
    execute("export.snippets", (client) =>
      client.query.snippet.findMany({
        where: and(
          eq(schema.snippet.blogId, blogId),
          after ? gt(schema.snippet.id, after) : undefined,
        ),
        orderBy: [asc(schema.snippet.id)],
        limit: pageSize,
      }),
    ),
  );
  const redirects = pages((after) =>
    execute("export.redirects", (client) =>
      client.query.redirect.findMany({
        where: and(
          eq(schema.redirect.blogId, blogId),
          after ? gt(schema.redirect.id, after) : undefined,
        ),
        orderBy: [asc(schema.redirect.id)],
        limit: pageSize,
      }),
    ),
  );
  const media = pages((after) =>
    execute("export.media", (client) =>
      client.query.mediaAsset.findMany({
        where: and(
          eq(schema.mediaAsset.blogId, blogId),
          after ? gt(schema.mediaAsset.id, after) : undefined,
        ),
        orderBy: [asc(schema.mediaAsset.id)],
        limit: pageSize,
        with: { variants: true },
      }),
    ),
  );
  const references = (assetId: string) =>
    pages((after) =>
      execute("export.mediaReferences", (client) =>
        client.query.post.findMany({
          columns: { id: true, title: true, slug: true },
          where: and(
            eq(schema.post.blogId, blogId),
            eq(schema.post.coverImageAssetId, assetId),
            after ? gt(schema.post.id, after) : undefined,
          ),
          orderBy: [asc(schema.post.id)],
          limit: pageSize,
        }),
      ),
    );
  const mediaBytes = execute("export.mediaBytes", (client) =>
    client
      .select({ bytes: sum(schema.mediaVariant.byteSize) })
      .from(schema.mediaVariant)
      .innerJoin(
        schema.mediaAsset,
        eq(schema.mediaVariant.assetId, schema.mediaAsset.id),
      )
      .where(
        and(
          eq(schema.mediaAsset.blogId, blogId),
          eq(schema.mediaAsset.status, "ready"),
          eq(schema.mediaVariant.kind, "original"),
        ),
      ),
  ).pipe(Effect.map((rows) => Number(rows[0]?.bytes ?? 0)));
  return {
    posts,
    revisions,
    authors,
    categories,
    snippets,
    redirects,
    media,
    references,
    mediaBytes,
  };
}
