import { createClient } from "@prosewire/sdk";
import { describe, expect, it, vi } from "vitest";
import { startMediaUpload } from "./api-entrypoints.ts";
import { BlogId, MediaAssetId } from "./domain.ts";

vi.mock("./api-entrypoints.ts", () => ({ startMediaUpload: vi.fn() }));

import { handlePrivateApi } from "./router.ts";

async function errorFor(path: string, init?: RequestInit) {
  const response = await handlePrivateApi(
    new Request(`http://localhost${path}`, init),
  );
  return {
    status: response.status,
    body: (await response.json()) as { _tag: string; message: string },
  };
}

describe("private API transport validation", () => {
  it("rejects a page size above the contract maximum", async () => {
    const result = await errorFor("/api/v1/posts?pageSize=101");

    expect(result.status).toBe(400);
    expect(result.body._tag).toBe("ApiInputRejected");
  });

  it("rejects malformed JSON before invoking the application runtime", async () => {
    const result = await errorFor("/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      _tag: "ApiInputRejected",
      message: "Invalid JSON request body",
    });
  });

  it("maps malformed encoded identifiers to an input error", async () => {
    const result = await errorFor("/api/v1/posts/%E0%A4%A");

    expect(result.status).toBe(400);
    expect(result.body._tag).toBe("ApiInputRejected");
  });

  it("rejects malformed revision identifiers before the application runtime", async () => {
    const result = await errorFor(
      "/api/v1/posts/11111111-1111-4111-8111-111111111111/revisions/not-a-uuid/restore",
      { method: "POST" },
    );

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      _tag: "ApiInputRejected",
      message: "Invalid revision id",
    });
  });
});

it("returns the upload reservation status expected by the generated SDK", async () => {
  const reservation = {
    asset: {
      id: MediaAssetId.make("55555555-5555-4555-8555-555555555555"),
      blogId: BlogId.make("11111111-1111-4111-8111-111111111111"),
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 1024,
      storageBytes: 0,
      width: null,
      height: null,
      checksumSha256: null,
      status: "pending" as const,
      url: null,
      variants: [],
      references: [],
      uploadedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    upload: {
      url: "https://media.example/upload",
      method: "PUT" as const,
      headers: {},
      expiresAt: "2026-01-01T00:15:00.000Z",
    },
    usage: { usedBytes: 1024, quotaBytes: 100000, remainingBytes: 98976 },
  };
  vi.mocked(startMediaUpload).mockResolvedValue(reservation);
  const statuses: number[] = [];
  const client = createClient({
    baseUrl: "https://prosewire.test",
    apiKey: "pw_test",
    fetch: async (input, init) => {
      const response = await handlePrivateApi(new Request(input, init));
      statuses.push(response.status);
      return response;
    },
  });
  await expect(
    client.media.startUpload({
      blogId: reservation.asset.blogId,
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 1024,
    }),
  ).resolves.toEqual(reservation);
  expect(statuses).toEqual([201]);
});
