import { isoDateTime, postMutationFields } from "@prosewire/contract/schemas";
import { Schema } from "effect";
import {
  AuthorId,
  BlogId,
  CategoryId,
  MediaAssetId,
  PostId,
} from "./domain.ts";

// datetime-local controls send local wall time without a timezone or seconds.
const formDateTime = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
        ? `${value}:00Z`
        : value;
      return Schema.is(isoDateTime)(candidate);
    },
    { expected: "a valid local or ISO calendar date and time" },
  ),
);

export class SavePostInput extends Schema.Class<SavePostInput>(
  "MutationEntrypoints.SavePostInput",
)({
  id: Schema.optional(PostId),
  blogId: BlogId,
  authorId: AuthorId,
  categoryIds: Schema.Array(CategoryId),
  title: postMutationFields.title,
  requestedSlug: Schema.String,
  excerpt: postMutationFields.excerpt,
  contentMarkdown: postMutationFields.contentMarkdown,
  requestedStatus: Schema.Literals(["draft", "scheduled", "published"]),
  featured: Schema.Boolean,
  locale: postMutationFields.locale,
  coverImageAssetId: Schema.NullOr(MediaAssetId),
  coverImageUrl: postMutationFields.coverImageUrl,
  coverImageAlt: postMutationFields.coverImageAlt,
  seoTitle: postMutationFields.seoTitle,
  seoDescription: postMutationFields.seoDescription,
  focusKeyword: postMutationFields.focusKeyword,
  canonicalUrl: postMutationFields.canonicalUrl,
  scheduledAt: Schema.NullOr(
    formDateTime.pipe(Schema.decodeTo(Schema.DateFromString)),
  ),
}) {}
