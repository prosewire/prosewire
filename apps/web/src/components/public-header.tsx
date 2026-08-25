import { MagnifyingGlass, Rss } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function PublicHeader({
  blog,
  authorSlug,
}: {
  blog: { name: string; slug: string };
  authorSlug?: string | undefined;
}) {
  return (
    <header className="border-b border-black/10 bg-[#f8f7f2]">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5">
        <Link
          href={`/b/${blog.slug}`}
          className="display-font text-xl font-bold tracking-[-.04em]"
        >
          {blog.name}
        </Link>
        <nav className="flex items-center gap-4 text-xs font-semibold text-[#687279]">
          <Link href={`/b/${blog.slug}`}>Stories</Link>
          {authorSlug ? (
            <Link href={`/b/${blog.slug}/authors/${authorSlug}`}>About</Link>
          ) : null}
          <a href={`/b/${blog.slug}/rss.xml`} aria-label="RSS feed">
            <Rss className="size-3.5" />
          </a>
          <form
            action={`/b/${blog.slug}`}
            className="hidden items-center rounded-full border border-black/10 bg-white px-3 sm:flex"
          >
            <MagnifyingGlass className="size-3.5 text-[#9aa1a4]" />
            <input
              aria-label="Search"
              name="q"
              placeholder="Search"
              className="h-8 w-28 bg-transparent px-2 text-xs outline-none"
            />
          </form>
          <ThemeToggle className="size-8 rounded-lg" />
        </nav>
      </div>
    </header>
  );
}
