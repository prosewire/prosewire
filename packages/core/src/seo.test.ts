import { describe, expect, it } from "vitest";
import { analyzeSeo } from "./seo.ts";
import { createExcerpt, readingMinutes, slugify } from "./content.ts";

describe("content helpers", () => {
  it("creates stable clean slugs", () => {
    expect(slugify("  A Better Blog, Déjà Vu!  ")).toBe("a-better-blog-deja-vu");
  });

  it("keeps excerpts on word boundaries", () => {
    expect(createExcerpt("One two three four five", 13)).toBe("One two three…");
  });

  it("never reports a zero-minute article", () => {
    expect(readingMinutes("Tiny post")).toBe(1);
  });
});

describe("analyzeSeo", () => {
  it("returns actionable checks and mention signals", () => {
    const markdown = `## What is portable publishing?\n\nPortable publishing is a way to keep content independent.\n\n## Why it matters\n\n- You own the data\n- You own the URLs\n\n## Next steps\n\nRead [another guide](/blog/another-guide). ${"useful detail ".repeat(80)}`;
    const result = analyzeSeo({
      title: "Portable publishing for modern product teams",
      description: "A practical guide to portable publishing, clean content ownership, and integrating a fast blog without rebuilding your existing website.",
      markdown,
      focusKeyword: "portable publishing",
      slug: "portable-publishing-guide",
    });

    expect(result.checks).toHaveLength(8);
    expect(result.mentionScore).toBeGreaterThanOrEqual(4);
    expect(result.score).toBeGreaterThan(70);
  });
});
