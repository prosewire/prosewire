import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

function createMarkdownEditor(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    content,
    contentType: "markdown",
  });
}

describe("Tiptap Markdown persistence", () => {
  it("keeps the core blog-writing structures portable", () => {
    const editor = createMarkdownEditor(`## A useful heading

A paragraph with **bold**, *emphasis*, and [a link](https://example.com).

- First point
- Second point

> A useful quotation.

\`\`\`ts
const portable = true;
\`\`\`

---`);

    const markdown = editor.getMarkdown();
    editor.destroy();

    expect(markdown).toContain("## A useful heading");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("*emphasis*");
    expect(markdown).toContain("[a link](https://example.com)");
    expect(markdown).toContain("- First point");
    expect(markdown).toContain("> A useful quotation.");
    expect(markdown).toContain("```ts");
    expect(markdown).toContain("const portable = true;");
    expect(markdown).toContain("---");
  });

  it("serializes rich-editor changes back to Markdown", () => {
    const editor = createMarkdownEditor("A calm first draft.");

    editor.chain().selectAll().toggleBold().run();

    const markdown = editor.getMarkdown();
    editor.destroy();

    expect(markdown).toContain("**A calm first draft.**");
  });
});
