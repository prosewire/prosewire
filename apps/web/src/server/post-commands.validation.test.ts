import { postCreateInput, postUpdateInput } from "@prosewire/contract/schemas";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CreatePostCommand, UpdatePostCommand } from "./post-commands.ts";
import { SavePostInput } from "./post-form-input.ts";

const fields = {
  blogId: "11111111-1111-4111-8111-111111111111",
  authorId: "22222222-2222-4222-8222-222222222222",
  title: "Draft",
  slug: "draft",
  contentMarkdown: "",
  status: "draft",
  featured: false,
  categoryIds: [],
};

describe("post command validation", () => {
  it.each([
    { title: "x".repeat(181) },
    { title: "   " },
    { slug: "Invalid Slug" },
    { excerpt: "x".repeat(501) },
    { seoTitle: "x".repeat(71) },
    { canonicalUrl: "invalid" },
    { scheduledAt: "2026-02-29T10:00:00Z" },
    { scheduledAt: "2026-99-99T99:99:99Z" },
  ])("rejects invalid input consistently: %o", (invalid) => {
    for (const schema of [
      postCreateInput,
      CreatePostCommand,
      postUpdateInput,
      UpdatePostCommand,
    ]) {
      expect(() =>
        Schema.decodeUnknownSync(schema)({
          ...fields,
          postId: fields.blogId,
          ...invalid,
        }),
      ).toThrow();
    }
  });

  it("decodes valid dates and preserves application Date values", () => {
    const input = { ...fields, scheduledAt: "2024-02-29T23:59:59+04:00" };
    const command = Schema.decodeUnknownSync(CreatePostCommand)(input);
    expect(command.scheduledAt).toEqual(new Date(input.scheduledAt));
    expect(
      Schema.decodeSync(Schema.toType(CreatePostCommand))(command),
    ).toEqual(command);
  });
});

describe("dashboard scheduling", () => {
  const form = {
    ...fields,
    requestedSlug: "draft",
    requestedStatus: "scheduled",
    locale: "en",
    excerpt: "",
    coverImageAssetId: null,
    coverImageUrl: null,
    coverImageAlt: null,
    seoTitle: null,
    seoDescription: null,
    focusKeyword: null,
    canonicalUrl: null,
  };
  it("accepts the datetime-local control's minute precision", () => {
    const scheduledAt = "2026-09-25T17:30";
    expect(
      Schema.decodeUnknownSync(SavePostInput)({ ...form, scheduledAt })
        .scheduledAt,
    ).toEqual(new Date(scheduledAt));
  });
  it("rejects impossible local dates before Date normalizes them", () => {
    expect(() =>
      Schema.decodeUnknownSync(SavePostInput)({
        ...form,
        scheduledAt: "2026-02-29T17:30",
      }),
    ).toThrow();
  });
});
