import Link from "next/link";
import { notFound } from "next/navigation";
import { blogStyle } from "@/components/blog-style";
import { PublicHeader } from "@/components/public-header";
import { loadPublicAuthor } from "@/server/page-entrypoints";

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ blog: string; author: string }>;
}) {
  const { blog: blogSlug, author: authorSlug } = await params;
  const result = await loadPublicAuthor(blogSlug, authorSlug);
  if (!result) notFound();
  const { blog, author, posts } = result;
  return (
    <main
      style={blogStyle(blog.accentColor)}
      className="min-h-screen bg-[#f8f7f2]"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: blog.customCss.replace(/<\/style/gi, "<\\/style"),
        }}
      />
      <PublicHeader blog={blog} authorSlug={author.slug} />
      <section className="border-b border-black/10 bg-[#efeee7]">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <div className="grid size-16 place-items-center rounded-full bg-[#172329] text-lg font-bold text-white">
            {author.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[var(--blog-accent)]">
            {author.jobTitle}
          </p>
          <h1 className="display-font mt-3 text-5xl">{author.name}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#657077]">
            {author.bio}
          </p>
          <p className="mt-4 text-xs text-[#8a9397]">{author.credentials}</p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="display-font text-3xl">
          Stories by {author.name.split(" ")[0]}
        </h2>
        <div className="mt-7 divide-y divide-black/10">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/b/${blog.slug}/${post.slug}`}
              className="block py-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--blog-accent)]">
                {post.categories[0]?.category.name}
              </p>
              <h3 className="display-font mt-2 text-3xl">{post.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#687279]">
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
