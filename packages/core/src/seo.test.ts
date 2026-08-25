import { describe, expect, it } from "vitest";
import {
  contentHeadings,
  createExcerpt,
  readingMinutes,
  renderMarkdown,
  sanitizeRenderedHtml,
  slugify,
} from "./content.ts";
import { analyzeSeo } from "./seo.ts";

describe("content helpers", () => {
  it("creates stable clean slugs", () => {
    expect(slugify("  A Better Blog, Déjà Vu!  ")).toBe(
      "a-better-blog-deja-vu",
    );
  });

  it("keeps excerpts on word boundaries", () => {
    expect(createExcerpt("One two three four five", 13)).toBe("One two three…");
  });

  it("never reports a zero-minute article", () => {
    expect(readingMinutes("Tiny post")).toBe(1);
  });

  it("gives duplicate headings stable unique anchors", async () => {
    const markdown =
      "## Repeat\n\n## Repeat\n\n### Repeat\n\n## Fish & Chips\n\n## Hello *world*";
    expect(contentHeadings(markdown)).toEqual([
      { level: 2, label: "Repeat", id: "repeat" },
      { level: 2, label: "Repeat", id: "repeat-2" },
      { level: 3, label: "Repeat", id: "repeat-3" },
      { level: 2, label: "Fish & Chips", id: "fish-chips" },
      { level: 2, label: "Hello world", id: "hello-world" },
    ]);
    expect(await renderMarkdown(markdown)).toContain('id="repeat-3"');
    expect(await renderMarkdown(markdown)).toContain('id="fish-chips"');
  });

  it("sanitizes previously rendered HTML before public delivery", () => {
    expect(sanitizeRenderedHtml('<p>Safe</p><script>alert("x")</script>')).toBe(
      "<p>Safe</p>",
    );
  });
});

describe("analyzeSeo", () => {
  it("returns actionable checks and mention signals", () => {
    const markdown = `## What is portable publishing?\n\nPortable publishing is a way to keep content independent.\n\n## Why it matters\n\n- You own the data\n- You own the URLs\n\n## Next steps\n\nRead [another guide](/blog/another-guide). ${"useful detail ".repeat(80)}`;
    const result = analyzeSeo({
      title: "Portable publishing for modern product teams",
      description:
        "A practical guide to portable publishing, clean content ownership, and integrating a fast blog without rebuilding your existing website.",
      markdown,
      focusKeyword: "portable publishing",
      slug: "portable-publishing-guide",
    });

    expect(result.checks).toHaveLength(8);
    expect(result.mentionScore).toBeGreaterThanOrEqual(4);
    expect(result.score).toBeGreaterThan(70);
  });
});
