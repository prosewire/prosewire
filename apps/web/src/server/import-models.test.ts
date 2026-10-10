import { describe, expect, it } from "vitest";
import { decodeImport, rewriteImportedUrls } from "./import-models.ts";

const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  publicationId: "22222222-2222-4222-8222-222222222222",
  filename: "image.png",
  declaredMimeType: "image/png",
  detectedMimeType: "image/png",
  byteSize: 1,
  storageBytes: 1,
  width: 1,
  height: 1,
  checksumSha256: "a".repeat(64),
  status: "ready",
  uploadedAt: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  references: [],
  variants: [
    {
      kind: "original",
      publicUrl: "https://source.test/image.png",
      mimeType: "image/png",
      byteSize: 1,
      width: 1,
      height: 1,
      checksumSha256: "a".repeat(64),
    },
  ],
};
describe("portable media URL validation and rewriting", () => {
  it.each([
    "",
    "p",
    "r",
    "javascript:alert(1)",
    "file:///tmp/image.png",
    "https://user:password@host.test/image.png",
  ])("rejects unsafe source URL %s", (publicUrl) => {
    expect(() =>
      decodeImport("mediaAssets", "mediaAssets[0]", {
        ...asset,
        variants: [{ ...asset.variants[0], publicUrl }],
      }),
    ).toThrow("Invalid media record");
  });
  it.each(["pending", "processing", "failed", "deleted"])(
    "rejects unsupported media status %s",
    (status) => {
      expect(() =>
        decodeImport("mediaAssets", "mediaAssets[0]", { ...asset, status }),
      ).toThrow("only ready assets");
    },
  );
  it("matches the longest source once without recursively rewriting destinations", () => {
    const urls = new Map([
      ["https://source.test/a", "https://destination.test/a"],
      ["https://source.test/a-long", "https://destination.test/long"],
      ["https://destination.test/a", "https://destination.test/cascade"],
    ]);
    expect(
      rewriteImportedUrls(
        "https://source.test/a-long https://source.test/a https://destination.test/a",
        urls,
      ),
    ).toBe(
      "https://destination.test/long https://destination.test/a https://destination.test/cascade",
    );
  });
  it("bounds rewritten content before constructing an oversized result", () => {
    expect(() =>
      rewriteImportedUrls(
        "https://x/ ".repeat(400_000),
        new Map([
          ["https://x/", `https://destination.test/${"a".repeat(100)}`],
        ]),
      ),
    ).toThrow("Rewritten content exceeds 8 MB");
  });
});
