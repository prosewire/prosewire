import { plainText, readingMinutes } from "./content.ts";

export type SeoCheckStatus = "pass" | "warning" | "fail";

export interface SeoCheck {
  id: string;
  label: string;
  detail: string;
  status: SeoCheckStatus;
  points: number;
  maxPoints: number;
}

export interface SeoAnalysis {
  score: number;
  mentionScore: number;
  wordCount: number;
  readingMinutes: number;
  checks: SeoCheck[];
}

export interface SeoInput {
  title: string;
  description?: string | null;
  markdown: string;
  focusKeyword?: string | null;
  slug?: string | null;
}

function check(
  id: string,
  label: string,
  pass: boolean,
  points: number,
  success: string,
  failure: string,
  warning = false,
): SeoCheck {
  return {
    id,
    label,
    detail: pass ? success : failure,
    status: pass ? "pass" : warning ? "warning" : "fail",
    points: pass ? points : warning ? Math.floor(points / 2) : 0,
    maxPoints: points,
  };
}

export function analyzeSeo(input: SeoInput): SeoAnalysis {
  const text = plainText(input.markdown);
  const words = text ? text.split(/\s+/) : [];
  const headings = input.markdown.match(/^#{2,3}\s+.+$/gm) ?? [];
  const images = input.markdown.match(/!\[[^\]]*\]\([^)]*\)/g) ?? [];
  const imagesWithAlt = input.markdown.match(/!\[[^\]]+\]\([^)]*\)/g) ?? [];
  const links = input.markdown.match(/\[[^\]]+\]\([^)]+\)/g) ?? [];
  const internalLinks = links.filter((link) => /\]\((\/|#)/.test(link));
  const keyword = input.focusKeyword?.trim().toLowerCase();
  const lowered =
    `${input.title} ${input.description ?? ""} ${text}`.toLowerCase();
  const keywordHits = keyword ? lowered.split(keyword).length - 1 : 0;
  const titleLength = input.title.trim().length;
  const descriptionLength = input.description?.trim().length ?? 0;
  const hasQuestionHeading = headings.some((heading) =>
    /\?|\b(how|what|why|when|where)\b/i.test(heading),
  );
  const hasList = /^(\s*[-*+]\s+|\s*\d+\.\s+)/m.test(input.markdown);
  const hasDefinition = /\b(is|means|refers to|defined as)\b/i.test(
    text.slice(0, 500),
  );

  const checks: SeoCheck[] = [
    check(
      "title",
      "Search title",
      titleLength >= 30 && titleLength <= 60,
      15,
      `${titleLength} characters`,
      "Aim for 30–60 characters",
      titleLength > 0,
    ),
    check(
      "description",
      "Meta description",
      descriptionLength >= 120 && descriptionLength <= 160,
      15,
      `${descriptionLength} characters`,
      "Aim for 120–160 characters",
      descriptionLength > 0,
    ),
    check(
      "length",
      "Useful depth",
      words.length >= 600,
      15,
      `${words.length} words`,
      "Add enough detail to answer the reader fully",
      words.length >= 300,
    ),
    check(
      "structure",
      "Scannable structure",
      headings.length >= 3,
      10,
      `${headings.length} section headings`,
      "Add at least three H2/H3 headings",
      headings.length > 0,
    ),
    check(
      "keyword",
      "Focus phrase",
      Boolean(keyword && keywordHits >= 2),
      15,
      keyword ? `Used ${keywordHits} times` : "Focus phrase set",
      keyword
        ? "Use the focus phrase naturally in the title and copy"
        : "Choose a focus phrase",
      Boolean(keyword && keywordHits > 0),
    ),
    check(
      "images",
      "Accessible images",
      images.length === 0 || images.length === imagesWithAlt.length,
      10,
      images.length ? "Every image has alt text" : "No images to check",
      "Add descriptive alt text to every image",
    ),
    check(
      "links",
      "Helpful internal links",
      internalLinks.length >= 1,
      10,
      `${internalLinks.length} internal link${internalLinks.length === 1 ? "" : "s"}`,
      "Add a relevant link to another post",
      links.length > 0,
    ),
    check(
      "slug",
      "Clean URL",
      Boolean(
        input.slug && input.slug.length <= 75 && !input.slug.includes("_"),
      ),
      10,
      input.slug ?? "Clean slug",
      "Use a short, readable slug",
      Boolean(input.slug),
    ),
  ];

  const earned = checks.reduce((sum, item) => sum + item.points, 0);
  const total = checks.reduce((sum, item) => sum + item.maxPoints, 0);
  const mentionSignals = [
    headings.length >= 3,
    hasQuestionHeading,
    hasList,
    hasDefinition,
    words.length >= 500,
  ];

  return {
    score: Math.round((earned / total) * 100),
    mentionScore: mentionSignals.filter(Boolean).length,
    wordCount: words.length,
    readingMinutes: readingMinutes(input.markdown),
    checks,
  };
}
