import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { postCreateInput, postUpdateInput } from "./schemas.ts";

describe("post mutation schemas", () => {
  it("applies defaults to create input", () => {
    expect(Schema.decodeUnknownSync(postCreateInput)({
      blogId: "11111111-1111-4111-8111-111111111111",
      authorId: "22222222-2222-4222-8222-222222222222",
      title: "Draft",
      slug: "draft",
    })).toMatchObject({
      contentMarkdown: "",
      status: "draft",
      locale: "en",
      featured: false,
      categoryIds: [],
    });
  });

  it("does not inject create defaults into a partial update", () => {
    expect(Schema.decodeUnknownSync(postUpdateInput)({ status: "published" })).toEqual({
      status: "published",
    });
  });
});
