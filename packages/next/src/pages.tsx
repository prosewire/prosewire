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
    return (
      <>
        <Head>
          <title>{post.seoTitle ?? post.title}</title>
          <meta
            name="description"
            content={post.seoDescription ?? post.excerpt}
          />
          {canonical ? <link rel="canonical" href={canonical} /> : null}
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
