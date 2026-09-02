import { navigate } from "astro:transitions/client";
import type { AstroProviderProps } from "fumadocs-core/framework/astro";
import type { Root } from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsPage, type DocsPageProps } from "fumadocs-ui/layouts/docs/page";
import { RootProvider } from "fumadocs-ui/provider/astro";
import type { ReactNode } from "react";
import ProsewireSearch from "./Search";

export function Docs({
  tree,
  children,
  pathname,
  params,
  page,
}: {
  tree: Root;
  children: ReactNode;
  pathname: string;
  params: AstroProviderProps["params"];
  page?: DocsPageProps;
}) {
  return (
    <RootProvider
      pathname={pathname}
      params={params}
      navigate={navigate}
      search={{ SearchDialog: ProsewireSearch }}
    >
      <DocsLayout
        tree={tree}
        githubUrl="https://github.com/prosewire/prosewire"
        themeSwitch={{ enabled: true, mode: "light-dark-system" }}
        nav={{
          title: (
            <span className="flex items-center gap-2.5 font-bold tracking-[-0.035em] text-fd-foreground">
              <span className="relative size-8 shrink-0">
                <img
                  src="/icon.png"
                  alt=""
                  width={32}
                  height={32}
                  className="theme-logo-light size-8 rounded-[0.65rem] shadow-sm"
                />
                <img
                  src="/icon-dark.png"
                  alt=""
                  width={32}
                  height={32}
                  className="theme-logo-dark absolute inset-0 size-8 rounded-[0.65rem] shadow-sm"
                />
              </span>
              <span>Prosewire</span>
              <span className="text-xs font-normal tracking-normal text-fd-muted-foreground">
                Docs
              </span>
            </span>
          ),
          url: "/docs/",
        }}
        links={[
          { text: "Website", url: "/" },
          { text: "Legal", url: "/legal/" },
          {
            text: "GitHub",
            url: "https://github.com/prosewire/prosewire",
            external: true,
          },
        ]}
      >
        <DocsPage {...page}>{children}</DocsPage>
      </DocsLayout>
    </RootProvider>
  );
}
