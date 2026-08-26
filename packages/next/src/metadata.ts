import type { PublicBlog, PublicPost } from "@prosewire/sdk";

export function postPresentationMetadata(
  blog: PublicBlog,
  post: PublicPost,
  canonicalUrl?: string,
) {
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.excerpt;
  const categories = post.categories.map((category) => category.name);

  return {
    title,
    description,
    canonicalUrl,
    siteName: blog.name,
    locale: post.locale,
    imageUrl: post.coverImageUrl,
    imageAlt: post.coverImageAlt ?? post.title,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    author: post.author.name,
    categories,
  };
}

export function postJsonLd(
  blog: PublicBlog,
  post: PublicPost,
  canonicalUrl?: string,
) {
  const metadata = postPresentationMetadata(blog, post, canonicalUrl);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: metadata.description,
    image: metadata.imageUrl,
    inLanguage: metadata.locale,
    datePublished: metadata.publishedAt,
    dateModified: metadata.updatedAt,
    mainEntityOfPage: metadata.canonicalUrl,
    articleSection: metadata.categories,
    keywords: metadata.categories.join(", "),
    author: { "@type": "Person", name: metadata.author },
    publisher: { "@type": "Organization", name: metadata.siteName },
  };
}
