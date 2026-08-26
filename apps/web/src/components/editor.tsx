"use client";

import {
  CalendarDots,
  Check,
  ClockCounterClockwise,
  FloppyDisk,
  Image as ImageIcon,
  Link,
  ListBullets,
  MagnifyingGlass,
  Sparkle,
  TextB,
  TextHTwo,
  TextItalic,
} from "@phosphor-icons/react";
import {
  analyzeSeo,
  type PostStatus,
  renderMarkdown,
  slugify,
} from "@prosewire/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { localeName } from "@/lib/locales";
import { restorePostRevision, savePost } from "@/server/actions";

interface EditorRevision {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly editor: string;
  readonly canRestore: boolean;
  readonly snapshot: {
    readonly title: string;
    readonly slug: string;
    readonly excerpt: string;
    readonly contentPreview: string;
    readonly contentTruncated: boolean;
    readonly status: PostStatus;
    readonly locale: string;
    readonly categoryCount: number | null;
  };
}

const revisionDateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

interface EditorPost {
  id?: string;
  blogId: string;
  authorId: string;
  categoryIds: ReadonlyArray<string>;
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  contentHtml: string;
  status: PostStatus;
  locale: string;
  featured: boolean;
  coverImageUrl: string;
  coverImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  canonicalUrl: string;
  scheduledAt: string;
  revisions: ReadonlyArray<EditorRevision>;
}

interface Option {
  readonly id: string;
  readonly name: string;
}

interface EditorProps {
  readonly post: EditorPost;
  readonly authors: ReadonlyArray<Option>;
  readonly categories: ReadonlyArray<Option>;
  readonly locales: ReadonlyArray<string>;
  readonly saved: boolean;
  readonly restored: boolean;
  readonly error: string | undefined;
  readonly canPublish: boolean;
}

function SubmitButton({
  value,
  children,
  secondary = false,
}: {
  value: string;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={pending}
      className={
        secondary
          ? "inline-flex h-9 items-center gap-2 rounded-xl border border-[#d8dad4] bg-white px-3 text-xs font-semibold shadow-sm disabled:opacity-60"
          : "inline-flex h-9 items-center gap-2 rounded-xl bg-[#ef6848] px-3.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
      }
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function Editor({
  post,
  authors,
  categories,
  locales,
  saved,
  restored,
  error,
  canPublish,
}: EditorProps) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [markdown, setMarkdown] = useState(post.contentMarkdown);
  const [description, setDescription] = useState(post.seoDescription);
  const [focusKeyword, setFocusKeyword] = useState(post.focusKeyword);
  const [categoryIds, setCategoryIds] = useState(
    () => new Set(post.categoryIds),
  );
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState(post.contentHtml);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const analysis = useMemo(
    () =>
      analyzeSeo({
        title: post.seoTitle || title,
        description,
        markdown,
        focusKeyword,
        slug,
      }),
    [description, focusKeyword, markdown, post.seoTitle, slug, title],
  );

  useEffect(() => {
    if (saved)
      toast.success("Post saved", {
        description: "The latest revision is safely stored.",
      });
  }, [saved]);

  useEffect(() => {
    if (restored)
      toast.success("Revision restored", {
        description: "The replaced version is still available in history.",
      });
  }, [restored]);

  useEffect(() => {
    if (error) toast.error("Post was not saved", { description: error });
  }, [error]);

  useEffect(() => {
    if (tab !== "preview") return;
    let cancelled = false;
    void renderMarkdown(markdown)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [markdown, tab]);

  function wrap(before: string, after = before, placeholder = "text") {
    const field = textarea.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = markdown.slice(start, end) || placeholder;
    const next = `${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }

  return (
    <form action={savePost} className="min-h-screen bg-[#efeee8]">
      {post.id ? <input type="hidden" name="id" value={post.id} /> : null}
      <input type="hidden" name="blogId" value={post.blogId} />
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#d9dbd5] bg-[#f8f7f2]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <a href="/posts" className="text-xs font-semibold text-[#6b767b]">
            ← Posts
          </a>
          <span className="h-4 w-px bg-[#d7d9d3]" />
          <span className="max-w-[210px] truncate text-xs font-semibold">
            {title || "Untitled post"}
          </span>
          <span className="hidden text-[10px] text-[#959da0] sm:inline">
            {post.status === "draft" ? "Draft" : post.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton value="draft" secondary>
            <FloppyDisk className="size-3.5" />
            Save draft
          </SubmitButton>
          {canPublish ? (
            <SubmitButton value="scheduled" secondary>
              <CalendarDots className="size-3.5" />
              Schedule
            </SubmitButton>
          ) : null}
          {canPublish ? (
            <SubmitButton value="published">
              <Check className="size-3.5" />
              {post.status === "published" ? "Publish changes" : "Publish"}
            </SubmitButton>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0 border-r border-[#d9dbd5] bg-white px-4 py-7 sm:px-8 lg:px-12 xl:px-20">
          <div className="mx-auto max-w-[820px]">
            <input
              aria-label="Post title"
              name="title"
              value={title}
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                if (!post.id || slug === slugify(title))
                  setSlug(slugify(value));
              }}
              placeholder="Give this post a clear title…"
              className="display-font w-full border-0 bg-transparent text-4xl leading-tight outline-none placeholder:text-[#c4c7c2] sm:text-5xl"
              required
              autoFocus={!post.id}
            />
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[#7b8589]">
              <select
                name="authorId"
                defaultValue={post.authorId}
                className="rounded-lg border border-[#e0e1dc] bg-[#fafaf7] px-2.5 py-1.5 outline-none"
              >
                {authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.name}
                  </option>
                ))}
              </select>
              <details className="relative rounded-lg border border-[#e0e1dc] bg-[#fafaf7] px-2.5 py-1.5">
                <summary className="cursor-pointer select-none">
                  {categoryIds.size === 0
                    ? "No categories"
                    : `${categoryIds.size} ${categoryIds.size === 1 ? "category" : "categories"}`}
                </summary>
                <fieldset className="absolute left-0 top-full z-10 mt-1 max-h-56 min-w-52 space-y-1 overflow-y-auto rounded-xl border border-[#d9dbd5] bg-white p-2 shadow-lg">
                  <legend className="sr-only">Categories</legend>
                  {categories.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-[#7b8589]">
                      No categories available
                    </p>
                  ) : (
                    categories.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f4f3ee]"
                      >
                        <input
                          type="checkbox"
                          name="categoryId"
                          value={category.id}
                          checked={categoryIds.has(category.id)}
                          onChange={(event) => {
                            setCategoryIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(category.id);
                              else next.delete(category.id);
                              return next;
                            });
                          }}
                          className="size-3.5 accent-[#ef6848]"
                        />
                        <span>{category.name}</span>
                      </label>
                    ))
                  )}
                </fieldset>
              </details>
              <span>
                {analysis.wordCount} words · {analysis.readingMinutes} min read
              </span>
            </div>

            <textarea
              name="excerpt"
              defaultValue={post.excerpt}
              placeholder="Write a concise summary for cards, feeds, and sharing…"
              className="mt-7 min-h-20 w-full resize-y rounded-xl border border-[#e0e1dc] bg-[#fafaf7] px-4 py-3 text-sm leading-6 outline-none focus:border-[#ef6848]"
            />

            <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9dbd5]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3e4df] bg-[#f7f6f1] px-2 py-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Bold"
                    onClick={() => wrap("**")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <TextB className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Italic"
                    onClick={() => wrap("_")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <TextItalic className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Heading"
                    onClick={() => wrap("## ", "", "Section heading")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <TextHTwo className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Link"
                    onClick={() => wrap("[", "](https://)", "link label")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <Link className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Image"
                    onClick={() => wrap("![", "](https://)", "alt text")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <ImageIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="List"
                    onClick={() => wrap("- ", "", "List item")}
                    className="grid size-8 place-items-center rounded-lg text-[#69757a] transition hover:bg-white hover:text-[#172329]"
                  >
                    <ListBullets className="size-3.5" />
                  </button>
                </div>
                <div className="flex rounded-lg border border-[#dcded8] bg-white p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setTab("write")}
                    className={`rounded-md px-2.5 py-1 ${tab === "write" ? "bg-[#172329] text-white" : "text-[#69757a]"}`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("preview")}
                    className={`rounded-md px-2.5 py-1 ${tab === "preview" ? "bg-[#172329] text-white" : "text-[#69757a]"}`}
                  >
                    Preview
                  </button>
                </div>
              </div>
              {tab === "write" ? (
                <textarea
                  ref={textarea}
                  name="contentMarkdown"
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder="Start writing in Markdown…"
                  className="min-h-[620px] w-full resize-y border-0 bg-white p-5 font-[Georgia] text-[17px] leading-8 outline-none sm:p-7"
                />
              ) : (
                <div
                  className="pw-prose min-h-[620px] p-5 sm:p-7"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          </div>
        </main>

        <aside className="bg-[#f7f6f1] px-4 py-6 sm:px-6 lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] lg:overflow-y-auto">
          <section>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MagnifyingGlass className="size-4 text-[#ef6848]" />
                <h2 className="text-sm font-semibold">Content checks</h2>
              </div>
              <span className="text-xs font-bold text-[#1f6e52]">
                {analysis.score}/100
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e2e4de]">
              <div
                className="h-full rounded-full bg-[#1f6e52] transition-all"
                style={{ width: `${analysis.score}%` }}
              />
            </div>
            <div className="mt-4 space-y-2">
              {analysis.checks.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#e0e1dc] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold">{item.label}</p>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wide ${item.status === "pass" ? "text-[#1f6e52]" : item.status === "warning" ? "text-[#c17c16]" : "text-[#c64b35]"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-[#7d878b]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 border-t border-[#dfe0db] pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle className="size-4 text-[#7b65b8]" />
                <h2 className="text-sm font-semibold">AI discovery</h2>
              </div>
              <span className="text-xs font-bold text-[#7b65b8]">
                {analysis.mentionScore}/5
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#7b8589]">
              Checks for answer-first structure, useful headings, definitions,
              lists, and sufficient context.
            </p>
          </section>

          {post.id ? (
            <section className="mt-6 border-t border-[#dfe0db] pt-6">
              <div className="flex items-center gap-2">
                <ClockCounterClockwise className="size-4 text-[#536d78]" />
                <h2 className="text-sm font-semibold">Revision history</h2>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-[#7b8589]">
                Prosewire saves the previous version before every update,
                archive, or restore.
              </p>
              <div className="mt-3 space-y-2">
                {post.revisions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#d7d9d3] px-3 py-4 text-center text-[10px] text-[#7b8589]">
                    No revisions yet
                  </p>
                ) : (
                  post.revisions.map((revision) => (
                    <details
                      key={revision.id}
                      className="group rounded-xl border border-[#e0e1dc] bg-white"
                    >
                      <summary className="cursor-pointer list-none px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold">
                              Version {revision.version}:{" "}
                              {revision.snapshot.title}
                            </p>
                            <p className="mt-0.5 text-[9px] text-[#7b8589]">
                              {revisionDateFormatter.format(
                                new Date(revision.createdAt),
                              )}{" "}
                              UTC · {revision.editor}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#eef0eb] px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#536167]">
                            {revision.snapshot.status}
                          </span>
                        </div>
                      </summary>
                      <div className="border-t border-[#ecece7] px-3 py-3">
                        <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1 text-[10px]">
                          <dt className="text-[#8a9397]">Slug</dt>
                          <dd className="truncate font-mono">
                            {revision.snapshot.slug}
                          </dd>
                          <dt className="text-[#8a9397]">Locale</dt>
                          <dd>{revision.snapshot.locale}</dd>
                          <dt className="text-[#8a9397]">Categories</dt>
                          <dd>
                            {revision.snapshot.categoryCount === null
                              ? "Not recorded"
                              : revision.snapshot.categoryCount}
                          </dd>
                        </dl>
                        {revision.snapshot.excerpt ? (
                          <p className="mt-3 text-[10px] leading-4 text-[#5f6c71]">
                            {revision.snapshot.excerpt}
                          </p>
                        ) : null}
                        <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f6f5f0] p-2.5 text-[9px] leading-4 text-[#46545a]">
                          {revision.snapshot.contentPreview || "Empty body"}
                          {revision.snapshot.contentTruncated
                            ? "\n\n[Preview truncated]"
                            : ""}
                        </pre>
                        {revision.canRestore ? (
                          <details className="mt-3 rounded-lg border border-[#e2c7bf] bg-[#fff8f5] px-2.5 py-2">
                            <summary className="cursor-pointer text-[10px] font-semibold text-[#a44230]">
                              Restore this version
                            </summary>
                            <p className="mt-2 text-[9px] leading-4 text-[#765b55]">
                              Your current version will be saved first. Unsaved
                              edits in this form will be discarded.
                            </p>
                            <button
                              type="submit"
                              formAction={restorePostRevision.bind(
                                null,
                                revision.id,
                              )}
                              formNoValidate
                              className="mt-2 h-8 rounded-lg bg-[#a44230] px-3 text-[10px] font-semibold text-white"
                            >
                              Confirm restore
                            </button>
                          </details>
                        ) : (
                          <p className="mt-3 text-[9px] leading-4 text-[#a44230]">
                            Your role cannot restore this publication state.
                          </p>
                        )}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </section>
          ) : null}

          <section className="mt-6 space-y-4 border-t border-[#dfe0db] pt-6">
            <h2 className="text-sm font-semibold">Search & publishing</h2>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Slug
              <input
                name="slug"
                value={slug}
                onChange={(event) => setSlug(slugify(event.target.value))}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Focus phrase
              <input
                name="focusKeyword"
                value={focusKeyword}
                onChange={(event) => setFocusKeyword(event.target.value)}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Search title
              <input
                name="seoTitle"
                defaultValue={post.seoTitle}
                placeholder={title}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Meta description
              <textarea
                name="seoDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-[#dcded8] bg-white px-2.5 py-2 text-xs font-normal leading-5 tracking-normal text-[#172329] outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Schedule time
              <input
                name="scheduledAt"
                type="datetime-local"
                defaultValue={post.scheduledAt}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Language
              <select
                name="locale"
                defaultValue={post.locale}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none"
              >
                {locales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeName(locale)} ({locale})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Canonical URL
              <input
                name="canonicalUrl"
                defaultValue={post.canonicalUrl}
                placeholder="Optional"
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Cover image URL
              <input
                name="coverImageUrl"
                defaultValue={post.coverImageUrl}
                placeholder="https://…"
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
              Cover alt text
              <input
                name="coverImageAlt"
                defaultValue={post.coverImageAlt}
                className="mt-1.5 h-9 w-full rounded-lg border border-[#dcded8] bg-white px-2.5 text-xs font-normal tracking-normal text-[#172329] outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                name="featured"
                type="checkbox"
                defaultChecked={post.featured}
                className="size-4 accent-[#ef6848]"
              />
              Pin on the blog homepage
            </label>
          </section>
        </aside>
      </div>
    </form>
  );
}
