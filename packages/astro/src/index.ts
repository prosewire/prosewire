import { createPublicClient, type PublicContentClient } from "@prosewire/sdk";
import type { AstroIntegration } from "astro";

export interface ProsewireAstroOptions {
  readonly baseUrl: string;
  readonly publication: string;
  readonly basePath?: string;
  readonly siteUrl?: string;
  readonly revalidate?: number;
  readonly injectRoutes?: boolean;
  readonly fetch?: typeof fetch;
}

export function normalizeBasePath(value = "/blog"): string {
  const normalized = `/${value}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized === "" ? "/" : normalized;
}

export function createProsewire(
  options: ProsewireAstroOptions,
): PublicContentClient {
  return createPublicClient({
    baseUrl: options.baseUrl,
    blog: options.publication,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export default function prosewire(
  options: ProsewireAstroOptions,
): AstroIntegration {
  const basePath = normalizeBasePath(options.basePath);
  const virtualId = "virtual:prosewire/config";
  const resolvedVirtualId = `\0${virtualId}`;
  const values = {
    baseUrl: options.baseUrl,
    publication: options.publication,
    basePath,
    siteUrl: options.siteUrl,
    revalidate: options.revalidate ?? 60,
  };
  return {
    name: "@prosewire/astro",
    hooks: {
      "astro:config:setup": ({ config, injectRoute, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: "@prosewire/astro/config",
                resolveId(id) {
                  return id === virtualId ? resolvedVirtualId : undefined;
                },
                load(id) {
                  if (id !== resolvedVirtualId) return undefined;
                  return Object.entries(values)
                    .map(
                      ([key, value]) =>
                        `export const ${key} = ${JSON.stringify(value)};`,
                    )
                    .join("\n");
                },
              },
            ],
          },
        });
        if (options.injectRoutes === false) return;
        const isStatic = config.output === "static";
        injectRoute({
          pattern: basePath,
          entrypoint: new URL(
            isStatic
              ? "../routes/static-index.astro"
              : "../routes/server-index.astro",
            import.meta.url,
          ),
          prerender: isStatic,
        });
        injectRoute({
          pattern: `${basePath === "/" ? "" : basePath}/[slug]`,
          entrypoint: new URL(
            isStatic
              ? "../routes/static-post.astro"
              : "../routes/server-post.astro",
            import.meta.url,
          ),
          prerender: isStatic,
        });
      },
    },
  };
}
