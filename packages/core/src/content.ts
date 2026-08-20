import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "figure",
  "figcaption",
  "details",
  "summary",
  "iframe",
];

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`()!-]/g, " ")
    .replaceAll("[", " ")
    .replaceAll("]", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
}

export interface ContentHeading {
  readonly level: 2 | 3;
  readonly label: string;
  readonly id: string;
}

function uniqueId(label: string, counts: Map<string, number>): string {
  const base = slugify(label) || "section";
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function contentHeadings(markdown: string): ReadonlyArray<ContentHeading> {
  const counts = new Map<string, number>();
  return (markdown.match(/^#{2,3}\s+.+$/gm) ?? []).map((heading) => {
    const level = heading.startsWith("###") ? 3 : 2;
    const label = plainText(heading.replace(/^#{2,3}\s+/, ""));
    return { level, label, id: uniqueId(label, counts) };
  });
}

export function sanitizeRenderedHtml(
  html: string,
  headings: ReadonlyArray<ContentHeading> = [],
): string {
  const clean = sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "title", "width", "height", "allow", "allowfullscreen"],
      code: ["class"],
    },
    allowedIframeHostnames: ["www.youtube.com", "player.vimeo.com"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          ...(attribs["href"]?.startsWith("http")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {}),
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, loading: attribs["loading"] ?? "lazy" },
      }),
    },
  });
  const counts = new Map<string, number>();
  let headingIndex = 0;
  return clean.replace(
    /<h([23])(?:\s[^>]*)?>(.*?)<\/h\1>/g,
    (_match, level: string, inner: string) => {
      const configuredId = headings[headingIndex]?.id;
      headingIndex += 1;
      const label = inner.replace(/<[^>]+>/g, "");
      return `<h${level} id="${configuredId ?? uniqueId(label, counts)}">${inner}</h${level}>`;
    },
  );
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const raw = await marked.parse(markdown, { gfm: true, breaks: false });
  return sanitizeRenderedHtml(raw, contentHeadings(markdown));
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createExcerpt(markdown: string, maxLength = 180): string {
  const text = plainText(markdown);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 80 ? boundary : maxLength).trim()}…`;
}
