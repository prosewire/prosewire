"use client";

import {
  ArrowLeft,
  CalendarDots,
  Check,
  ClockCounterClockwise,
  Eye,
  FloppyDisk,
  Image as ImageIcon,
  Link as LinkIcon,
  MagnifyingGlass,
  SidebarSimple,
  Sparkle,
} from "@phosphor-icons/react";
import {
  analyzeSeo,
  type PostStatus,
  renderMarkdown,
  slugify,
} from "@prosewire/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { localeName } from "@/lib/locales";
import {
  finishMediaUpload,
  requestMediaUpload,
  restorePostRevision,
  savePost,
} from "@/server/actions";
import { Select } from "./select";
import { TiptapMarkdownEditor } from "./tiptap-markdown-editor";

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
  coverImageAssetId: string;
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
  readonly publicationName: string;
  readonly publicationUrl: string;
  readonly saved: boolean;
  readonly restored: boolean;
  readonly error: string | undefined;
  readonly canPublish: boolean;
  readonly media: {
    readonly configured: boolean;
    readonly maxUploadBytes: number;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly filename: string;
      readonly status: string;
      readonly url: string | null;
    }>;
  };
}

type SidebarTab = "post" | "seo" | "social";

const fieldLabelClass =
  "mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#8a9397]";
const fieldClass =
  "min-h-10 w-full rounded-lg border border-[#dcded8] bg-white px-3 text-xs font-normal tracking-normal text-[#172329] outline-none transition focus:border-[#ef6848] focus:ring-2 focus:ring-[#ef6848]/10";
const textAreaClass = `${fieldClass} resize-y py-2.5 leading-5`;

function SubmitButton({
  value,
  label,
  children,
  primary = false,
}: {
  readonly value: string;
  readonly label: string;
  readonly children: React.ReactNode;
  readonly primary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      value={value}
      aria-label={label}
      disabled={pending}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold shadow-sm transition disabled:opacity-60",
        primary
          ? "border border-[#ef6848] bg-[#ef6848] text-white hover:bg-[#df5d40]"
          : "border border-[#d8dad4] bg-white text-[#172329] hover:bg-[#f4f3ee]",
      )}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function SidebarTabs({
  selected,
  onSelect,
}: {
  readonly selected: SidebarTab;
  readonly onSelect: (tab: SidebarTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Post settings"
      className="sticky top-0 z-10 grid grid-cols-3 border-b border-[#d9dbd5] bg-[#f7f6f1] px-3 pt-2"
    >
      {(["post", "seo", "social"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={selected === tab}
          onClick={() => onSelect(tab)}
          className={cn(
            "h-10 border-b-2 border-transparent text-[11px] font-semibold capitalize text-[#7b8589] transition",
            selected === tab && "border-[#ef6848] text-[#172329]",
          )}
        >
          {tab === "seo" ? "SEO" : tab}
        </button>
      ))}
    </div>
  );
}

function RevisionHistory({ post }: { readonly post: EditorPost }) {
  if (!post.id) return null;
  return (
    <section className="border-t border-[#dfe0db] pt-5">
      <div className="flex items-center gap-2">
        <ClockCounterClockwise className="size-4 text-[#536d78]" />
        <h3 className="text-xs font-semibold">Revision history</h3>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-[#7b8589]">
        The current version is saved before every update, archive, or restore.
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
                      Version {revision.version}: {revision.snapshot.title}
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
                      The current version is saved first. Unsaved edits in this
                      form will be discarded.
                    </p>
                    <button
                      type="submit"
                      formAction={restorePostRevision.bind(null, revision.id)}
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
  );
}

export function Editor({
  post,
  authors,
  categories,
  locales,
  publicationName,
  publicationUrl,
  saved,
  restored,
  error,
  canPublish,
  media,
}: EditorProps) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [markdown, setMarkdown] = useState(post.contentMarkdown);
  const [seoTitle, setSeoTitle] = useState(post.seoTitle);
  const [description, setDescription] = useState(post.seoDescription);
  const [focusKeyword, setFocusKeyword] = useState(post.focusKeyword);
  const [canonicalUrl, setCanonicalUrl] = useState(post.canonicalUrl);
  const [coverImageAssetId, setCoverImageAssetId] = useState(
    post.coverImageAssetId,
  );
  const [coverImageUrl, setCoverImageUrl] = useState(post.coverImageUrl);
  const [coverImageAlt, setCoverImageAlt] = useState(post.coverImageAlt);
  const [authorId, setAuthorId] = useState(post.authorId);
  const [categoryIds, setCategoryIds] = useState(
    () => new Set(post.categoryIds),
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("seo");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [sourceEditing, setSourceEditing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(post.contentHtml);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  const analysis = useMemo(
    () =>
      analyzeSeo({
        title: seoTitle || title,
        description,
        markdown,
        focusKeyword,
        slug,
      }),
    [description, focusKeyword, markdown, seoTitle, slug, title],
  );

  const baseUrl = publicationUrl.replace(/\/$/, "");
  const displayBaseUrl = baseUrl.replace(/^https?:\/\//, "");
  const resolvedSlug = slug || "untitled";
  const selectedAuthor =
    authors.find((author) => author.id === authorId)?.name ?? "Unknown author";
  const selectedCategories = categories
    .filter((category) => categoryIds.has(category.id))
    .map((category) => category.name);
  const searchTitle = seoTitle || title || "Untitled post";
  const searchDescription = description || excerpt || "Add a post summary.";
  const hasCoverPreview = /^https?:\/\//.test(coverImageUrl);
  const readyMedia = media.items.filter(
    (asset) => asset.status === "ready" && asset.url,
  );

  async function uploadCover(file: File): Promise<void> {
    setUploadError(undefined);
    if (file.size > media.maxUploadBytes) {
      setUploadError(
        `Choose an image smaller than ${Math.floor(media.maxUploadBytes / 1_048_576)} MB.`,
      );
      return;
    }
    setUploadingCover(true);
    try {
      const reservation = await requestMediaUpload({
        blogId: post.blogId,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
      });
      const response = await fetch(reservation.upload.url, {
        method: reservation.upload.method,
        headers: reservation.upload.headers,
        body: file,
      });
      if (!response.ok) {
        throw new Error(
          `Object storage rejected the upload (${response.status})`,
        );
      }
      const asset = await finishMediaUpload(post.blogId, reservation.asset.id);
      if (!asset.url)
        throw new Error("The processed image has no delivery URL");
      setCoverImageAssetId(asset.id);
      setCoverImageUrl(asset.url);
      toast.success("Cover image uploaded");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to upload image";
      setUploadError(message);
      toast.error("Cover image was not uploaded", { description: message });
    } finally {
      setUploadingCover(false);
    }
  }

  useEffect(() => {
    if (saved)
      toast.success("Post saved", {
        description: "The latest revision is safely stored.",
      });
  }, [saved]);

  useEffect(() => {
    if (restored)
      toast.success("Revision restored", {
        description: "The replaced version remains available in history.",
      });
  }, [restored]);

  useEffect(() => {
    if (error) toast.error("Post was not saved", { description: error });
  }, [error]);

  useEffect(() => {
    if (!previewing) return;
    let cancelled = false;
    void renderMarkdown(markdown)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [markdown, previewing]);

  return (
    <form action={savePost} className="min-h-screen bg-[#efeee8]">
      {post.id ? <input type="hidden" name="id" value={post.id} /> : null}
      <input type="hidden" name="blogId" value={post.blogId} />
      <input type="hidden" name="contentMarkdown" value={markdown} />
      <input type="hidden" name="coverImageAssetId" value={coverImageAssetId} />

      <header className="sticky top-16 z-10 flex min-h-[59px] flex-wrap items-center justify-between gap-3 border-b border-[#d9dbd5] bg-[#f8f7f2]/95 px-3 py-2 backdrop-blur sm:px-5 lg:top-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/posts"
            aria-label="Back to posts"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#687279] transition hover:bg-white hover:text-[#172329]"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="hidden h-4 w-px bg-[#d7d9d3] sm:block" />
          <div className="min-w-0">
            <p className="max-w-40 truncate text-xs font-semibold sm:max-w-56">
              {title || "Untitled post"}
            </p>
            <p className="mt-0.5 text-[9px] capitalize text-[#8a9397]">
              {post.status}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label={previewing ? "Return to editor" : "Preview post"}
            aria-pressed={previewing}
            onClick={() => setPreviewing((current) => !current)}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#d8dad4] bg-white px-2.5 text-xs font-semibold shadow-sm transition hover:bg-[#f4f3ee]",
              previewing && "bg-[#172329] text-white hover:bg-[#172329]",
            )}
          >
            <Eye className="size-3.5" />
            <span className="hidden md:inline">
              {previewing ? "Edit" : "Preview"}
            </span>
          </button>
          <button
            type="button"
            aria-label={sidebarOpen ? "Hide settings" : "Show settings"}
            aria-pressed={!sidebarOpen}
            onClick={() => setSidebarOpen((current) => !current)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#d8dad4] bg-white px-2.5 text-xs font-semibold shadow-sm transition hover:bg-[#f4f3ee]"
          >
            <SidebarSimple className="size-3.5" />
            <span className="hidden xl:inline">
              {sidebarOpen ? "Focus" : "Settings"}
            </span>
          </button>
          <SubmitButton value="draft" label="Save draft">
            <FloppyDisk className="size-3.5" />
            <span className="hidden sm:inline">Save</span>
          </SubmitButton>
          {canPublish ? (
            <SubmitButton value="scheduled" label="Schedule post">
              <CalendarDots className="size-3.5" />
              <span className="hidden xl:inline">Schedule</span>
            </SubmitButton>
          ) : null}
          {canPublish ? (
            <SubmitButton value="published" label="Publish post" primary>
              <Check className="size-3.5" />
              <span>Publish</span>
            </SubmitButton>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "mx-auto grid max-w-[1600px]",
          sidebarOpen && "lg:grid-cols-[minmax(0,1fr)_330px]",
        )}
      >
        <main
          className={cn(
            "min-w-0 bg-white px-6 py-12 sm:px-10 lg:px-12 xl:px-20",
            sidebarOpen && "lg:border-r lg:border-[#d9dbd5]",
          )}
        >
          <div className="mx-auto max-w-[760px]">
            <textarea
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
              rows={1}
              className="display-font min-h-[1.1em] w-full resize-none overflow-hidden border-0 bg-transparent text-4xl leading-[1.06] outline-none [field-sizing:content] placeholder:text-[#c4c7c2] xl:text-5xl"
              required
              autoFocus={!post.id}
            />

            <div className="mt-4 flex min-w-0 items-center gap-1.5 text-[11px] text-[#7b8589]">
              <LinkIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                {displayBaseUrl}/<span>{resolvedSlug}</span>
              </span>
              <button
                type="button"
                aria-label="Edit URL slug"
                onClick={() => {
                  setSidebarOpen(true);
                  setSidebarTab("seo");
                  requestAnimationFrame(() =>
                    document.getElementById("post-slug")?.focus(),
                  );
                }}
                className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-[#ef6848] hover:bg-[#fee9df]"
              >
                Edit
              </button>
            </div>

            <textarea
              name="excerpt"
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              placeholder="Write a concise summary for cards, feeds, and sharing…"
              rows={2}
              className="mt-6 min-h-[3.5em] w-full resize-none overflow-hidden border-0 bg-transparent font-[Georgia] text-lg leading-7 text-[#647076] outline-none [field-sizing:content] placeholder:text-[#aeb4ad]"
            />

            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-[#7b8589]">
              <span className="grid size-7 place-items-center rounded-full bg-[#dfe8de] text-[9px] font-bold text-[#1f6e52]">
                {selectedAuthor
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span>{selectedAuthor}</span>
              {selectedCategories.length > 0 ? (
                <>
                  <span>·</span>
                  <span>{selectedCategories.join(", ")}</span>
                </>
              ) : null}
              <span>·</span>
              <span>
                {analysis.wordCount} words · {analysis.readingMinutes} min read
              </span>
            </div>

            <div className="mt-11 border-t border-[#ecece8] pt-9">
              {previewing ? (
                <div
                  className="pw-prose min-h-[520px]"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : sourceEditing ? (
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">Markdown source</p>
                      <p className="mt-1 text-[10px] text-[#7b8589]">
                        Use this for portable syntax the rich editor cannot
                        show.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSourceEditing(false)}
                      className="h-8 rounded-lg border border-[#d8dad4] bg-white px-3 text-[10px] font-semibold hover:bg-[#f4f3ee]"
                    >
                      Return to rich editor
                    </button>
                  </div>
                  <textarea
                    aria-label="Markdown source"
                    value={markdown}
                    onChange={(event) => setMarkdown(event.target.value)}
                    spellCheck={false}
                    className="min-h-[520px] w-full resize-y rounded-xl border border-[#d8dad4] bg-[#fafaf7] p-5 font-mono text-sm leading-6 text-[#29363b] outline-none focus:border-[#ef6848] focus:ring-2 focus:ring-[#ef6848]/10"
                  />
                </div>
              ) : (
                <TiptapMarkdownEditor value={markdown} onChange={setMarkdown} />
              )}
            </div>
          </div>
        </main>

        {sidebarOpen ? (
          <aside
            id="post-settings"
            className="bg-[#f7f6f1] lg:sticky lg:top-[59px] lg:h-[calc(100vh-59px)] lg:overflow-y-auto"
          >
            <SidebarTabs selected={sidebarTab} onSelect={setSidebarTab} />

            <div className="px-5 py-6">
              {sidebarTab === "post" ? (
                <div className="space-y-5" role="tabpanel">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Post settings</h2>
                    <span className="rounded-full bg-[#eef0eb] px-2 py-1 text-[9px] font-bold capitalize text-[#536167]">
                      {post.status}
                    </span>
                  </div>

                  <div>
                    <Select
                      name="authorId"
                      label="Author"
                      labelClassName={fieldLabelClass}
                      value={authorId}
                      onValueChange={setAuthorId}
                      options={authors.map((author) => ({
                        value: author.id,
                        label: author.name,
                      }))}
                      size="small"
                      className="h-10 rounded-lg px-3 text-xs shadow-none"
                    />
                  </div>

                  <fieldset>
                    <legend className={fieldLabelClass}>Categories</legend>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#dcded8] bg-white p-2">
                      {categories.length === 0 ? (
                        <p className="px-2 py-2 text-[10px] text-[#7b8589]">
                          No categories available
                        </p>
                      ) : (
                        categories.map((category) => (
                          <label
                            key={category.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[#f4f3ee]"
                          >
                            <input
                              type="checkbox"
                              name="categoryId"
                              value={category.id}
                              checked={categoryIds.has(category.id)}
                              onChange={(event) => {
                                setCategoryIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked)
                                    next.add(category.id);
                                  else next.delete(category.id);
                                  return next;
                                });
                              }}
                              className="size-3.5 accent-[#ef6848]"
                            />
                            {category.name}
                          </label>
                        ))
                      )}
                    </div>
                  </fieldset>

                  <div>
                    <Select
                      name="locale"
                      label="Language"
                      labelClassName={fieldLabelClass}
                      defaultValue={post.locale}
                      options={locales.map((locale) => ({
                        value: locale,
                        label: `${localeName(locale)} (${locale})`,
                      }))}
                      size="small"
                      className="h-10 rounded-lg px-3 text-xs shadow-none"
                    />
                  </div>

                  <label className="block">
                    <span className={fieldLabelClass}>Schedule time</span>
                    <input
                      name="scheduledAt"
                      type="datetime-local"
                      defaultValue={post.scheduledAt}
                      className={fieldClass}
                    />
                  </label>

                  <label className="flex min-h-10 items-center justify-between gap-3 border-y border-[#dfe0db] py-2 text-xs font-medium">
                    <span>Pin on the publication home</span>
                    <input
                      name="featured"
                      type="checkbox"
                      defaultChecked={post.featured}
                      className="size-4 accent-[#ef6848]"
                    />
                  </label>

                  <section>
                    <h3 className="text-xs font-semibold">Portable source</h3>
                    <p className="mt-1 text-[9px] leading-4 text-[#7b8589]">
                      The rich editor saves Markdown. Open the source view for
                      uncommon syntax or embedded HTML.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewing(false);
                        setSourceEditing((current) => !current);
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLElement>(
                              '[aria-label="Markdown source"]',
                            )
                            ?.focus(),
                        );
                      }}
                      className="mt-3 h-9 w-full rounded-lg border border-[#d8dad4] bg-white px-3 text-[10px] font-semibold hover:bg-[#f4f3ee]"
                    >
                      {sourceEditing
                        ? "Return to rich editor"
                        : "Edit Markdown source"}
                    </button>
                  </section>

                  <RevisionHistory post={post} />
                </div>
              ) : null}

              {sidebarTab === "seo" ? (
                <div role="tabpanel">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <MagnifyingGlass className="size-4 text-[#ef6848]" />
                      <h2 className="text-sm font-semibold">
                        Search appearance
                      </h2>
                    </div>
                    <span className="text-xs font-bold text-[#1f6e52]">
                      {analysis.score}/100
                    </span>
                  </div>

                  <label className="mt-5 block">
                    <span className={fieldLabelClass}>
                      <span>URL slug</span>
                      <span className="normal-case tracking-normal text-[#959da0]">
                        Redirected after publish
                      </span>
                    </span>
                    <div className="flex min-w-0 items-center rounded-lg border border-[#dcded8] bg-white focus-within:border-[#ef6848] focus-within:ring-2 focus-within:ring-[#ef6848]/10">
                      <span className="shrink-0 pl-3 text-[10px] text-[#8a9397]">
                        {displayBaseUrl}/
                      </span>
                      <input
                        id="post-slug"
                        name="slug"
                        value={slug}
                        onChange={(event) =>
                          setSlug(slugify(event.target.value))
                        }
                        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1 pr-3 text-xs outline-none"
                        required
                      />
                    </div>
                  </label>

                  <label className="mt-4 block">
                    <span className={fieldLabelClass}>
                      <span>Search title</span>
                      <span className="normal-case tracking-normal text-[#959da0]">
                        {seoTitle.length}/70
                      </span>
                    </span>
                    <input
                      name="seoTitle"
                      value={seoTitle}
                      onChange={(event) => setSeoTitle(event.target.value)}
                      placeholder={title || "Uses post title"}
                      maxLength={70}
                      className={fieldClass}
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className={fieldLabelClass}>
                      <span>Meta description</span>
                      <span className="normal-case tracking-normal text-[#959da0]">
                        {description.length}/180
                      </span>
                    </span>
                    <textarea
                      name="seoDescription"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Uses the post summary"
                      maxLength={180}
                      className={`${textAreaClass} min-h-24`}
                    />
                  </label>

                  <div className="mt-5 rounded-xl border border-[#dcded8] bg-white p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[.1em] text-[#8a9397]">
                      Search preview
                    </p>
                    <p className="mt-3 truncate text-[10px] text-[#1f6e52]">
                      {publicationName} · {displayBaseUrl}
                    </p>
                    <p className="mt-1 text-[15px] leading-5 text-[#2855a7]">
                      {searchTitle}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-[#5f6a70]">
                      {searchDescription}
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className={fieldLabelClass}>Focus phrase</span>
                    <input
                      name="focusKeyword"
                      value={focusKeyword}
                      onChange={(event) => setFocusKeyword(event.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className={fieldLabelClass}>
                      <span>Canonical URL</span>
                      <span className="normal-case tracking-normal text-[#959da0]">
                        Optional override
                      </span>
                    </span>
                    <input
                      name="canonicalUrl"
                      type="url"
                      value={canonicalUrl}
                      onChange={(event) => setCanonicalUrl(event.target.value)}
                      placeholder={`${baseUrl}/${resolvedSlug}`}
                      className={fieldClass}
                    />
                  </label>

                  <section className="mt-6 border-t border-[#dfe0db] pt-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold">Content checks</h3>
                      <span className="text-[10px] text-[#7b8589]">
                        {
                          analysis.checks.filter(
                            (item) => item.status === "pass",
                          ).length
                        }
                        /{analysis.checks.length} passed
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {analysis.checks.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#e0e1dc] bg-white p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold">
                              {item.label}
                            </p>
                            <span
                              className={cn(
                                "text-[8px] font-bold uppercase tracking-wide",
                                item.status === "pass"
                                  ? "text-[#1f6e52]"
                                  : item.status === "warning"
                                    ? "text-[#c17c16]"
                                    : "text-[#c64b35]",
                              )}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[9px] leading-4 text-[#7d878b]">
                            {item.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mt-6 border-t border-[#dfe0db] pt-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkle className="size-4 text-[#7b65b8]" />
                        <h3 className="text-xs font-semibold">AI discovery</h3>
                      </div>
                      <span className="text-xs font-bold text-[#7b65b8]">
                        {analysis.mentionScore}/5
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] leading-4 text-[#7b8589]">
                      Checks answer-first structure, headings, definitions,
                      lists, and context.
                    </p>
                  </section>
                </div>
              ) : null}

              {sidebarTab === "social" ? (
                <div role="tabpanel">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-[#ef6848]" />
                    <h2 className="text-sm font-semibold">Social card</h2>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-[#7b8589]">
                    Search fields provide the title and description. The cover
                    image is used for Open Graph and large social cards.
                  </p>

                  <div className="mt-5 overflow-hidden rounded-xl border border-[#dcded8] bg-white">
                    {hasCoverPreview ? (
                      <div
                        role="img"
                        aria-label={coverImageAlt || "Post cover image"}
                        className="aspect-[1.91/1] bg-[#e5e6e1] bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${JSON.stringify(coverImageUrl)})`,
                        }}
                      />
                    ) : (
                      <div className="grid aspect-[1.91/1] place-items-center bg-[#efeee8] text-center text-[#7b8589]">
                        <div>
                          <ImageIcon className="mx-auto size-6" />
                          <p className="mt-2 text-[10px]">No cover image yet</p>
                        </div>
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-xs font-semibold leading-4">
                        {searchTitle}
                      </p>
                      <p className="mt-1 truncate text-[9px] text-[#7b8589]">
                        {displayBaseUrl}
                      </p>
                    </div>
                  </div>

                  {media.configured ? (
                    <div className="mt-5 rounded-xl border border-[#dcded8] bg-white p-3">
                      <label className="block">
                        <span className={fieldLabelClass}>Upload image</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          disabled={uploadingCover}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadCover(file);
                            event.target.value = "";
                          }}
                          className="block w-full text-[10px] text-[#687279] file:mr-3 file:rounded-lg file:border-0 file:bg-[#172329] file:px-3 file:py-2 file:text-[10px] file:font-semibold file:text-white disabled:opacity-60"
                        />
                      </label>
                      <p className="mt-2 text-[9px] leading-4 text-[#7b8589]">
                        {uploadingCover
                          ? "Uploading and processing image…"
                          : `JPEG, PNG, WebP, or AVIF. Maximum ${Math.floor(media.maxUploadBytes / 1_048_576)} MB.`}
                      </p>
                      {uploadError ? (
                        <p className="mt-2 text-[9px] leading-4 text-[#b84432]">
                          {uploadError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {readyMedia.length > 0 ? (
                    <div className="mt-4">
                      <Select
                        name="coverImageLibrary"
                        label="Media library"
                        labelClassName={fieldLabelClass}
                        value={coverImageAssetId || "external"}
                        onValueChange={(value) => {
                          const asset = readyMedia.find(
                            (item) => item.id === value,
                          );
                          setCoverImageAssetId(asset?.id ?? "");
                          if (asset?.url) setCoverImageUrl(asset.url);
                        }}
                        options={[
                          {
                            value: "external",
                            label: "Use an external URL",
                          },
                          ...readyMedia.map((asset) => ({
                            value: asset.id,
                            label: asset.filename,
                          })),
                        ]}
                        size="small"
                        className="h-10 rounded-lg px-3 text-xs shadow-none"
                      />
                    </div>
                  ) : null}

                  <label className="mt-5 block">
                    <span className={fieldLabelClass}>Cover image URL</span>
                    <input
                      name="coverImageUrl"
                      type="url"
                      value={coverImageUrl}
                      onChange={(event) => {
                        setCoverImageAssetId("");
                        setCoverImageUrl(event.target.value);
                      }}
                      placeholder="https://…"
                      className={fieldClass}
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className={fieldLabelClass}>Image alt text</span>
                    <textarea
                      name="coverImageAlt"
                      value={coverImageAlt}
                      onChange={(event) => setCoverImageAlt(event.target.value)}
                      className={`${textAreaClass} min-h-20`}
                    />
                  </label>

                  <div className="mt-6 rounded-xl border border-[#dce8e2] bg-[#f0f8f3] p-3">
                    <p className="text-[10px] font-semibold text-[#1f6e52]">
                      Generated from post data
                    </p>
                    <p className="mt-1 text-[9px] leading-4 text-[#5f6a70]">
                      Prosewire adds the article URL, publication name, locale,
                      author, category, and publish dates to public metadata.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </form>
  );
}
