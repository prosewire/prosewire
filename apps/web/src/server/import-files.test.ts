import { createReadStream } from "node:fs";
import { ApiImportRejected } from "@prosewire/contract";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { importRecords, receiveImport } from "./import-files.ts";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, createReadStream: vi.fn(fs.createReadStream) };
});
function body(bytes: Uint8Array, size = 1) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) controller.close();
      else {
        controller.enqueue(bytes.subarray(offset, offset + size));
        offset = Math.min(offset + size, bytes.length);
      }
    },
  });
}
const fixture = {
  format: "prosewire-portable-export",
  version: 2,
  publication: { id: "source", name: "編集部" },
  authors: [{ id: "author", name: "Zoë" }],
  categories: [],
  snippets: [],
  redirects: [],
  mediaAssets: [],
  posts: [
    {
      id: "post",
      contentMarkdown: 'Unicode: 🐈, braces { and escaped quotes "',
    },
  ],
};

describe("streamed portable import files", () => {
  it("spools records independently across single-byte UTF-8 chunks", async () => {
    const files = await receiveImport(
      body(strToU8(JSON.stringify(fixture))),
      "application/json",
    );
    try {
      expect(files.header["publication"]).toEqual(fixture.publication);
      expect(files.counts).toEqual({ authors: 1, posts: 1 });
      const records = [];
      for await (const record of importRecords(files, "posts"))
        records.push(record.value);
      expect(records).toEqual(fixture.posts);
      expect(files.header).not.toHaveProperty("posts");
    } finally {
      await files.dispose();
    }
  });
  it("accepts the existing nested media ZIP without trusting its filesystem paths", async () => {
    const media = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          format: "prosewire-media-export",
          version: 1,
          publication: fixture.publication,
          assets: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              sourcePath:
                "assets/11111111-1111-4111-8111-111111111111/original.png",
            },
          ],
        }),
      ),
      "assets/11111111-1111-4111-8111-111111111111/original.png":
        new Uint8Array([1, 2, 3]),
    });
    const files = await receiveImport(
      body(
        zipSync({
          "export.json": strToU8(JSON.stringify(fixture)),
          "media.zip": media,
        }),
        23,
      ),
      "application/zip",
    );
    try {
      expect([...files.mediaPaths]).toEqual([
        "media/assets/11111111-1111-4111-8111-111111111111/original.png",
      ]);
    } finally {
      await files.dispose();
    }
    await expect(
      receiveImport(
        body(
          zipSync({
            "export.json": strToU8(JSON.stringify(fixture)),
            "../escape": strToU8("bad"),
          }),
        ),
        "application/zip",
      ),
    ).rejects.toMatchObject({ _tag: "ApiImportRejected", item: "../escape" });
  });
  it("closes the spooled file descriptor when validation stops reading early", async () => {
    const files = await receiveImport(
      body(
        strToU8(
          JSON.stringify({
            ...fixture,
            posts: Array.from({ length: 200 }, (_, id) => ({
              id,
              body: "x".repeat(4096),
            })),
          }),
        ),
        64 * 1024,
      ),
      "application/json",
    );
    vi.mocked(createReadStream).mockClear();
    try {
      const records = importRecords(files, "posts");
      await records.next();
      const input = vi.mocked(createReadStream).mock.results[0]?.value;
      expect(input?.destroyed).toBe(false);
      await records.return();
      expect(input?.destroyed).toBe(true);
    } finally {
      await files.dispose();
    }
  });
  it.each([
    JSON.stringify(fixture).slice(0, -1),
    JSON.stringify({ ...fixture, version: 99 }),
    JSON.stringify({ ...fixture, posts: {} }),
    JSON.stringify(fixture).replace('"version":2', '"version":2,"version":2'),
    JSON.stringify({
      ...fixture,
      authors: [{ content: "x".repeat(8 * 1_024 * 1_024 + 1) }],
    }),
  ])(
    "rejects truncated, unsupported, ambiguous, or oversized exports",
    async (source) => {
      await expect(
        receiveImport(body(strToU8(source), 64 * 1_024), "application/json"),
      ).rejects.toBeInstanceOf(ApiImportRejected);
    },
  );
});
