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

export async function renderMarkdown(markdown: string): Promise<string> {
  const raw = await marked.parse(markdown, { gfm: true, breaks: false });
  const clean = sanitizeHtml(raw, {
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
  return clean.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "");
    return `<h${level} id="${slugify(label)}">${inner}</h${level}>`;
  });
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
