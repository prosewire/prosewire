import { describe, expect, it } from "vitest";
import { ApiInputRejected, ApiPostNotFound } from "./router.ts";
import { decodePrivateApiRequest } from "./transport.ts";

describe("private API request contract", () => {
  it("applies pagination defaults and decodes filters", async () => {
    const request = new Request(
      "http://localhost/api/v1/posts?blog=fieldnotes&status=published&page=2&pageSize=25&search=effect",
    );

    await expect(decodePrivateApiRequest(request)).resolves.toEqual({
      _tag: "ListPosts",
      input: {
        status: "published",
        blog: "fieldnotes",
        page: 2,
        pageSize: 25,
        search: "effect",
      },
    });
  });

  it("decodes post mutations with contract schemas", async () => {
    const request = new Request("http://localhost/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blogId: "11111111-1111-4111-8111-111111111111",
        authorId: "22222222-2222-4222-8222-222222222222",
        title: "Contract-owned transport",
        slug: "contract-owned-transport",
        contentMarkdown: "# Typed",
      }),
    });

    const decoded = await decodePrivateApiRequest(request);

    expect(decoded).toMatchObject({
      _tag: "CreatePost",
      input: {
        blogId: "11111111-1111-4111-8111-111111111111",
        authorId: "22222222-2222-4222-8222-222222222222",
        title: "Contract-owned transport",
        slug: "contract-owned-transport",
        status: "draft",
        locale: "en",
        featured: false,
        categoryIds: [],
      },
    });
  });

  it("decodes revision list and restore routes", async () => {
    const postId = "11111111-1111-4111-8111-111111111111";
    const revisionId = "22222222-2222-4222-8222-222222222222";

    await expect(
      decodePrivateApiRequest(
        new Request(`http://localhost/api/v1/posts/${postId}/revisions`),
      ),
    ).resolves.toEqual({ _tag: "ListPostRevisions", id: postId });
    await expect(
      decodePrivateApiRequest(
        new Request(
          `http://localhost/api/v1/posts/${postId}/revisions/${revisionId}/restore`,
          { method: "POST" },
        ),
      ),
    ).resolves.toEqual({
      _tag: "RestorePostRevision",
      id: postId,
      revisionId,
    });
  });

  it("owns malformed input and unknown-route failures", async () => {
    await expect(
      decodePrivateApiRequest(
        new Request("http://localhost/api/v1/posts?pageSize=101"),
      ),
    ).rejects.toBeInstanceOf(ApiInputRejected);
    await expect(
      decodePrivateApiRequest(new Request("http://localhost/api/v1/missing")),
    ).rejects.toBeInstanceOf(ApiPostNotFound);
    await expect(
      decodePrivateApiRequest(
        new Request(
          "http://localhost/api/v1/posts/11111111-1111-4111-8111-111111111111/revisions/not-a-uuid/restore",
          { method: "POST" },
        ),
      ),
    ).rejects.toBeInstanceOf(ApiInputRejected);
  });
});
