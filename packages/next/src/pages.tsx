import type {
  PublicPost,
  PublicPostPage,
  PublicPostResult,
  PublicRedirect,
} from "@prosewire/sdk";
import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import { createElement } from "react";
import { ProsewireIndex, ProsewirePost } from "./components.tsx";
import { postPresentationMetadata } from "./metadata.ts";
import {
  canonicalPostUrl,
  createNextClient,
  normalizeBasePath,
  type ProsewireNextOptions,
  postPath,
} from "./shared.ts";

export function createProsewirePages(options: ProsewireNextOptions) {
  const client = createNextClient(options);
  const basePath = normalizeBasePath(options.basePath);
  const revalidate = options.revalidate ?? 60;
  const IndexPage = options.components?.IndexPage ?? ProsewireIndex;
  const PostPage = options.components?.PostPage ?? ProsewirePost;

  type IndexProps = { readonly result: PublicPostPage };
  const indexGetStaticProps: GetStaticProps<IndexProps> = async () => ({
    props: { result: await client.listPosts({ page: 1, pageSize: 12 }) },
    revalidate,
  });

  function IndexRoute({ result }: IndexProps) {
    return (
      <>
        <Head>
          <title>{result.blog.name}</title>
          <meta name="description" content={result.blog.description} />
        </Head>
        {createElement(IndexPage, { result, basePath })}
      </>
    );
  }

  const postGetStaticPaths = (async () => {
    const [posts, redirects] = await Promise.all([
      client.listAllPosts(),
      client.listRedirects(),
    ]);
    return {
      paths: [
        ...posts.map((post: PublicPost) => ({ params: { slug: post.slug } })),
        ...redirects.map((redirect: PublicRedirect) => ({
          params: { slug: redirect.fromPath },
        })),
      ],
      fallback: "blocking",
    };
  }) satisfies GetStaticPaths;

  type PostProps = PublicPostResult;
  const postGetStaticProps: GetStaticProps<PostProps> = async ({ params }) => {
    const slug =
      typeof params?.slug === "string" ? params.slug : params?.slug?.[0];
    if (!slug) return { notFound: true, revalidate };
    const result = await client.resolvePost(slug);
    if (result.status === "not-found") return { notFound: true, revalidate };
    if (result.status === "redirect") {
      return {
        redirect: {
          destination: postPath(basePath, result.slug),
          permanent: true,
        },
        revalidate,
      };
    }
    return { props: { blog: result.blog, post: result.post }, revalidate };
  };

  function PostRoute({ blog, post }: PostProps) {
    const canonical = canonicalPostUrl(options, blog, post);
    const metadata = postPresentationMetadata(blog, post, canonical);
    return (
      <>
        <Head>
          <title>{metadata.title}</title>
          <meta name="description" content={metadata.description} />
          {canonical ? <link rel="canonical" href={canonical} /> : null}
          <meta property="og:type" content="article" />
          <meta property="og:title" content={metadata.title} />
          <meta property="og:description" content={metadata.description} />
          <meta property="og:site_name" content={metadata.siteName} />
          <meta property="og:locale" content={metadata.locale} />
          {metadata.canonicalUrl ? (
            <meta property="og:url" content={metadata.canonicalUrl} />
          ) : null}
          {metadata.imageUrl ? (
            <>
              <meta property="og:image" content={metadata.imageUrl} />
              <meta property="og:image:alt" content={metadata.imageAlt} />
            </>
          ) : null}
          {metadata.publishedAt ? (
            <meta
              property="article:published_time"
              content={metadata.publishedAt}
            />
          ) : null}
          <meta property="article:modified_time" content={metadata.updatedAt} />
          <meta property="article:author" content={metadata.author} />
          {metadata.categories.map((category) => (
            <meta
              key={category}
              property="article:section"
              content={category}
            />
          ))}
          <meta
            name="twitter:card"
            content={metadata.imageUrl ? "summary_large_image" : "summary"}
          />
          <meta name="twitter:title" content={metadata.title} />
          <meta name="twitter:description" content={metadata.description} />
          {metadata.imageUrl ? (
            <>
              <meta name="twitter:image" content={metadata.imageUrl} />
              <meta name="twitter:image:alt" content={metadata.imageAlt} />
            </>
          ) : null}
        </Head>
        {createElement(PostPage, {
          blog,
          post,
          basePath,
          canonicalUrl: canonical,
        })}
      </>
    );
  }

  return {
    client,
    index: { Page: IndexRoute, getStaticProps: indexGetStaticProps },
    post: {
      Page: PostRoute,
      getStaticPaths: postGetStaticPaths,
      getStaticProps: postGetStaticProps,
    },
  };
}

export type { ProsewireNextOptions } from "./shared.ts";
