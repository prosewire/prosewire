import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentPrompt,
  detectFramework,
  discoverProjects,
  findInstallContext,
  resolveProjectRoot,
  scaffold,
} from "./index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(manifest: object) {
  const root = await mkdtemp(join(tmpdir(), "create-prosewire-test-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return root;
}

async function workspace() {
  const root = await project({
    name: "workspace",
    private: true,
    packageManager: "pnpm@11.1.0",
    workspaces: ["apps/*", "packages/*"],
  });
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    'packages:\n  - "apps/*"\n  - "packages/*"\n',
  );
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return root;
}

async function nextApp(root: string, path: string) {
  const appRoot = join(root, path);
  await mkdir(join(appRoot, "src", "app"), { recursive: true });
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: path.replaceAll("/", "-"), dependencies: { next: "16.3.1" } }, null, 2)}\n`,
  );
  return appRoot;
}

async function astroApp(root: string, path: string) {
  const appRoot = join(root, path);
  await mkdir(appRoot, { recursive: true });
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: path.replaceAll("/", "-"), dependencies: { astro: "7.2.3" } }, null, 2)}\n`,
  );
  await writeFile(join(appRoot, "astro.config.mjs"), "export default {};\n");
  return appRoot;
}

describe("create-prosewire", () => {
  it("detects and scaffolds a Next.js App Router project", async () => {
    const root = await project({
      name: "consumer",
      dependencies: { next: "16.3.1" },
    });
    await mkdir(join(root, "src", "app"), { recursive: true });

    await expect(detectFramework(root)).resolves.toMatchObject({
      framework: "next-app",
    });
    const result = await scaffold({
      root,
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
      install: false,
    });

    expect(result.files).toContain("src/app/writing/[slug]/page.tsx");
    expect(
      await readFile(join(root, "src", "lib", "prosewire.ts"), "utf8"),
    ).toContain("createProsewireApp");
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    expect(manifest.dependencies["@prosewire/next"]).toBe("^0.2.1");
  });

  it("detects Astro server output and writes layout-friendly pages", async () => {
    const root = await project({
      name: "consumer",
      dependencies: { astro: "7.2.3" },
    });
    await writeFile(
      join(root, "astro.config.mjs"),
      'export default { output: "server" };\n',
    );

    const result = await scaffold({
      root,
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/blog",
      install: false,
    });

    expect(result.framework).toBe("astro-server");
    expect(
      await readFile(join(root, "pages", "blog", "index.astro"), "utf8"),
    ).toContain("Cache-Control");
  });

  it("refuses to overwrite an existing route", async () => {
    const root = await project({
      name: "consumer",
      dependencies: { next: "16.3.1" },
    });
    await mkdir(join(root, "app", "blog"), { recursive: true });
    await writeFile(
      join(root, "app", "blog", "page.tsx"),
      "export default function Page() {}\n",
    );

    await expect(
      scaffold({
        root,
        baseUrl: "https://content.example",
        publication: "field-notes",
        basePath: "/blog",
        install: false,
      }),
    ).rejects.toThrow("Refusing to overwrite");
  });

  it("discovers a single app and installs from the monorepo root", async () => {
    const root = await workspace();
    const appRoot = await nextApp(root, "apps/web");
    await mkdir(join(root, "packages", "ui"), { recursive: true });
    await writeFile(
      join(root, "packages", "ui", "package.json"),
      '{"name":"@workspace/ui"}\n',
    );

    await expect(discoverProjects(root)).resolves.toEqual([appRoot]);
    await expect(resolveProjectRoot(root)).resolves.toBe(appRoot);
    await expect(findInstallContext(appRoot)).resolves.toEqual({
      root,
      manager: "pnpm",
    });

    await scaffold({
      root: appRoot,
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/blog",
      install: false,
    });

    const appManifest = JSON.parse(
      await readFile(join(appRoot, "package.json"), "utf8"),
    );
    const rootManifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    expect(appManifest.dependencies["@prosewire/next"]).toBe("^0.2.1");
    expect(rootManifest.dependencies).toBeUndefined();
    await expect(
      readFile(join(appRoot, "src", "app", "blog", "page.tsx"), "utf8"),
    ).resolves.toContain("blog.index.Page");
  });

  it("requires --cwd when a monorepo has multiple supported apps", async () => {
    const root = await workspace();
    await nextApp(root, "apps/web");
    const docsRoot = await astroApp(root, "apps/docs");

    await expect(resolveProjectRoot(root)).rejects.toThrow(
      "Multiple supported apps were found: apps/docs, apps/web",
    );
    await expect(resolveProjectRoot(root, "apps/docs")).resolves.toBe(docsRoot);
  });

  it("finds the workspace when invoked from a nested directory", async () => {
    const root = await workspace();
    const appRoot = await astroApp(root, "apps/docs");
    const nestedRoot = join(root, "packages", "tooling");
    await mkdir(nestedRoot, { recursive: true });

    await expect(resolveProjectRoot(nestedRoot)).resolves.toBe(appRoot);
  });

  it("produces an agent prompt that protects host styles and secrets", () => {
    const prompt = agentPrompt({
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
    });

    expect(prompt).toContain("Preserve the existing layout and styles");
    expect(prompt).toContain("Do not add a management API key");
    expect(prompt).toContain("install dependencies from the workspace root");
  });
});
