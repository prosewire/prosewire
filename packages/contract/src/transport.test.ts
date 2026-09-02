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

  it("decodes media reads, upload steps, backup, and deletion", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const blogId = "22222222-2222-4222-8222-222222222222";

    await expect(
      decodePrivateApiRequest(new Request("http://localhost/api/v1/media")),
    ).resolves.toEqual({ _tag: "ListMedia" });
    await expect(
      decodePrivateApiRequest(
        new Request(`http://localhost/api/v1/media/${id}`),
      ),
    ).resolves.toEqual({ _tag: "GetMedia", id });
    await expect(
      decodePrivateApiRequest(
        new Request("http://localhost/api/v1/media/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            blogId,
            filename: "cover.webp",
            mimeType: "image/webp",
            byteSize: 1_024,
          }),
        }),
      ),
    ).resolves.toMatchObject({
      _tag: "StartMediaUpload",
      input: { blogId, filename: "cover.webp", byteSize: 1_024 },
    });
    await expect(
      decodePrivateApiRequest(
        new Request(`http://localhost/api/v1/media/${id}/complete`, {
          method: "POST",
        }),
      ),
    ).resolves.toEqual({ _tag: "CompleteMediaUpload", id });
    await expect(
      decodePrivateApiRequest(
        new Request(`http://localhost/api/v1/media/${id}/backup`, {
          method: "POST",
        }),
      ),
    ).resolves.toEqual({ _tag: "BackupMedia", id });
    await expect(
      decodePrivateApiRequest(
        new Request(`http://localhost/api/v1/media/${id}`, {
          method: "DELETE",
        }),
      ),
    ).resolves.toEqual({ _tag: "DeleteMedia", id });
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
    await expect(
      decodePrivateApiRequest(
        new Request("http://localhost/api/v1/media/not-a-uuid"),
      ),
    ).rejects.toBeInstanceOf(ApiInputRejected);
  });
});
