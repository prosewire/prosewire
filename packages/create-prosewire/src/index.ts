#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCli } from "./cli.ts";
import { version } from "./version.ts";

type Framework = "next-app" | "next-pages" | "astro-static" | "astro-server";

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly packageManager?: string;
  readonly workspaces?:
    | ReadonlyArray<string>
    | { readonly packages?: ReadonlyArray<string> };
  readonly [key: string]: unknown;
}

type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export interface InstallContext {
  readonly root: string;
  readonly manager: PackageManager;
}

export interface ScaffoldOptions {
  readonly root: string;
  readonly baseUrl: string;
  readonly publication: string;
  readonly basePath: string;
  readonly router?: "app" | "pages";
  readonly install?: boolean;
}

const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function readManifest(root: string): Promise<PackageManifest> {
  return JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as PackageManifest;
}

function frameworkDependency(manifest: PackageManifest) {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  return Boolean(dependencies.next || dependencies.astro);
}

async function isFrameworkProject(root: string) {
  if (!(await exists(join(root, "package.json")))) return false;
  const manifest = await readManifest(root);
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  const sourceRoot = (await exists(join(root, "src")))
    ? join(root, "src")
    : root;
  if (dependencies.next) {
    return (
      (await exists(join(sourceRoot, "app"))) ||
      (await exists(join(sourceRoot, "pages")))
    );
  }
  if (dependencies.astro) {
    if (await exists(join(sourceRoot, "pages"))) return true;
    for (const file of [
      "astro.config.mjs",
      "astro.config.ts",
      "astro.config.js",
    ]) {
      if (await exists(join(root, file))) return true;
    }
  }
  return false;
}

async function isWorkspaceRoot(root: string) {
  if (await exists(join(root, "pnpm-workspace.yaml"))) return true;
  if (!(await exists(join(root, "package.json")))) return false;
  return Boolean((await readManifest(root)).workspaces);
}

function managerFromManifest(
  manifest: PackageManifest,
): PackageManager | undefined {
  const name = manifest.packageManager?.split("@")[0];
  return name === "bun" || name === "pnpm" || name === "yarn" || name === "npm"
    ? name
    : undefined;
}

async function managerAt(root: string): Promise<PackageManager | undefined> {
  if (await exists(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(root, "yarn.lock"))) return "yarn";
  if (
    (await exists(join(root, "bun.lock"))) ||
    (await exists(join(root, "bun.lockb")))
  ) {
    return "bun";
  }
  if (await exists(join(root, "package-lock.json"))) return "npm";
  if (await exists(join(root, "package.json"))) {
    return managerFromManifest(await readManifest(root));
  }
  return undefined;
}

export async function findInstallContext(
  projectRoot: string,
): Promise<InstallContext> {
  const target = resolve(projectRoot);
  let directory = target;
  let nearest: InstallContext | undefined;
  while (true) {
    const manager = await managerAt(directory);
    if (!nearest && manager) nearest = { root: directory, manager };
    if (await isWorkspaceRoot(directory)) {
      return { root: directory, manager: manager ?? nearest?.manager ?? "npm" };
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return nearest ?? { root: target, manager: "npm" };
}

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export async function discoverProjects(
  workspaceRoot: string,
): Promise<ReadonlyArray<string>> {
  const projects: string[] = [];
  const pending = [resolve(workspaceRoot)];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    const manifestPath = join(directory, "package.json");
    if (await exists(manifestPath)) {
      const manifest = await readManifest(directory);
      if (
        frameworkDependency(manifest) &&
        (await isFrameworkProject(directory))
      ) {
        projects.push(directory);
      }
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        pending.push(join(directory, entry.name));
      }
    }
  }
  return projects.sort();
}

export async function resolveProjectRoot(
  start: string,
  cwd?: string,
): Promise<string> {
  const invocationRoot = resolve(start);
  if (cwd) {
    const target = resolve(invocationRoot, cwd);
    if (!(await exists(join(target, "package.json")))) {
      throw new Error(`No package.json was found at ${target}.`);
    }
    return target;
  }
  if (await isFrameworkProject(invocationRoot)) return invocationRoot;
  let directory = invocationRoot;
  let workspaceRoot: string | undefined;
  while (true) {
    if (await isWorkspaceRoot(directory)) {
      workspaceRoot = directory;
      break;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  workspaceRoot ??= invocationRoot;
  const projects = await discoverProjects(workspaceRoot);
  if (projects.length === 1) return projects[0] as string;
  if (projects.length === 0) {
    throw new Error(
      `No supported Next.js or Astro app was found under ${workspaceRoot}. Pass --cwd <path> to select one.`,
    );
  }
  const choices = projects
    .map((project) => relative(invocationRoot, project))
    .join(", ");
  throw new Error(
    `Multiple supported apps were found: ${choices}. Pass --cwd <path> to select one.`,
  );
}

function cleanBasePath(value: string) {
  const normalized = `/${value}`.replace(/\/+/g, "/").replace(/\/$/, "");
  if (!/^\/[a-z0-9/-]+$/i.test(normalized) || normalized.includes("..")) {
    throw new Error("--route must be a simple URL path such as /blog");
  }
  return normalized;
}

function importPath(fromDirectory: string, target: string) {
  const path = relative(fromDirectory, target)
    .split(sep)
    .join("/")
    .replace(/\.ts$/, "");
  return path.startsWith(".") ? path : `./${path}`;
}

export async function detectFramework(
  root: string,
  router?: "app" | "pages",
): Promise<{ framework: Framework; sourceRoot: string }> {
  const manifest = await readManifest(root);
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  const sourceRoot = (await exists(join(root, "src")))
    ? join(root, "src")
    : root;
  if (dependencies.next) {
    const hasApp = await exists(join(sourceRoot, "app"));
    const hasPages = await exists(join(sourceRoot, "pages"));
    if (router === "app") return { framework: "next-app", sourceRoot };
    if (router === "pages") return { framework: "next-pages", sourceRoot };
    if (hasApp && hasPages)
      throw new Error(
        "Both Next.js routers exist. Pass --router app or --router pages.",
      );
    if (hasApp) return { framework: "next-app", sourceRoot };
    if (hasPages) return { framework: "next-pages", sourceRoot };
    throw new Error(
      "Next.js is installed, but no app or pages directory was found.",
    );
  }
  if (dependencies.astro) {
    const configPath = [
      "astro.config.mjs",
      "astro.config.ts",
      "astro.config.js",
    ].map((file) => join(root, file));
    let source = "";
    for (const path of configPath) {
      if (await exists(path)) {
        source = await readFile(path, "utf8");
        break;
      }
    }
    return {
      framework: /output\s*:\s*["']server["']/.test(source)
        ? "astro-server"
        : "astro-static",
      sourceRoot,
    };
  }
  throw new Error("No supported Next.js or Astro project was detected.");
}

function nextFiles(
  framework: "next-app" | "next-pages",
  sourceRoot: string,
  baseUrl: string,
  publication: string,
  basePath: string,
) {
  const routeParts = basePath.slice(1).split("/");
  const lib = join(sourceRoot, "lib", "prosewire.ts");
  const routerRoot = join(
    sourceRoot,
    framework === "next-app" ? "app" : "pages",
  );
  const packageEntry =
    framework === "next-app" ? "@prosewire/next/app" : "@prosewire/next/pages";
  const factory =
    framework === "next-app" ? "createProsewireApp" : "createProsewirePages";
  const config = `import { ${factory} } from "${packageEntry}";\n\nexport const blog = ${factory}({\n  baseUrl: ${JSON.stringify(baseUrl)},\n  publication: ${JSON.stringify(publication)},\n  basePath: ${JSON.stringify(basePath)},\n});\n`;
  if (framework === "next-app") {
    const index = join(routerRoot, ...routeParts, "page.tsx");
    const post = join(routerRoot, ...routeParts, "[slug]", "page.tsx");
    return new Map([
      [lib, config],
      [
        index,
        `import { blog } from ${JSON.stringify(importPath(dirname(index), lib))};\n\nexport const generateMetadata = blog.index.generateMetadata;\nexport default blog.index.Page;\n`,
      ],
      [
        post,
        `import { blog } from ${JSON.stringify(importPath(dirname(post), lib))};\n\nexport const generateMetadata = blog.post.generateMetadata;\nexport default blog.post.Page;\n`,
      ],
    ]);
  }
  const pagesIndex = join(routerRoot, ...routeParts, "index.tsx");
  const pagesPost = join(routerRoot, ...routeParts, "[slug].tsx");
  return new Map([
    [lib, config],
    [
      pagesIndex,
      `import { blog } from ${JSON.stringify(importPath(dirname(pagesIndex), lib))};\n\nexport const getStaticProps = blog.index.getStaticProps;\nexport default blog.index.Page;\n`,
    ],
    [
      pagesPost,
      `import { blog } from ${JSON.stringify(importPath(dirname(pagesPost), lib))};\n\nexport const getStaticPaths = blog.post.getStaticPaths;\nexport const getStaticProps = blog.post.getStaticProps;\nexport default blog.post.Page;\n`,
    ],
  ]);
}

function astroFiles(
  framework: "astro-static" | "astro-server",
  sourceRoot: string,
  baseUrl: string,
  publication: string,
  basePath: string,
) {
  const routeRoot = join(sourceRoot, "pages", ...basePath.slice(1).split("/"));
  const lib = join(sourceRoot, "lib", "prosewire.ts");
  const config = `import { createProsewire } from "@prosewire/astro";\n\nexport const blog = createProsewire({\n  baseUrl: ${JSON.stringify(baseUrl)},\n  publication: ${JSON.stringify(publication)},\n  basePath: ${JSON.stringify(basePath)},\n});\nexport const prosewireBasePath = ${JSON.stringify(basePath)};\n`;
  const index = join(routeRoot, "index.astro");
  const post = join(routeRoot, "[slug].astro");
  const indexImport = importPath(dirname(index), lib);
  const postImport = importPath(dirname(post), lib);
  const serverHeaders =
    framework === "astro-server"
      ? `Astro.response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");\n`
      : "";
  const indexLoad =
    framework === "astro-static"
      ? `const [firstPage, posts] = await Promise.all([blog.listPosts({ page: 1, pageSize: 100 }), blog.listAllPosts()]);\nconst result = { ...firstPage, posts, pagination: { page: 1, pageSize: posts.length, hasMore: false } };\n`
      : `const result = await blog.listPosts({ page: 1, pageSize: 12 });\n`;
  const indexControls =
    framework === "astro-static" ? " queryControls={false}" : "";
  const staticPaths =
    framework === "astro-static"
      ? `export async function getStaticPaths() {\n  const [posts, redirects] = await Promise.all([blog.listAllPosts(), blog.listRedirects()]);\n  return [...posts.map((post) => ({ params: { slug: post.slug } })), ...redirects.map((item) => ({ params: { slug: item.fromPath } }))];\n}\n\n`
      : "";
  return new Map([
    [lib, config],
    [
      index,
      `---\nimport PostList from "@prosewire/astro/components/PostList.astro";\nimport { blog, prosewireBasePath } from ${JSON.stringify(indexImport)};\n\n${indexLoad}${serverHeaders}---\n\n<PostList result={result} basePath={prosewireBasePath}${indexControls} />\n`,
    ],
    [
      post,
      `---\nimport PostArticle from "@prosewire/astro/components/PostArticle.astro";\nimport { blog, prosewireBasePath } from ${JSON.stringify(postImport)};\n\n${staticPaths}const result = await blog.resolvePost(Astro.params.slug ?? "");\nif (result.status === "not-found") return new Response("Not found", { status: 404 });\nif (result.status === "redirect") return Astro.redirect(\`${basePath}/\${encodeURIComponent(result.slug)}\`, 301);\n${serverHeaders}---\n\n<PostArticle blog={result.blog} post={result.post} basePath={prosewireBasePath} />\n`,
    ],
  ]);
}

export function agentPrompt(
  options: Omit<ScaffoldOptions, "root" | "install">,
) {
  return `Add Prosewire to this project.\n\nDeployment: ${options.baseUrl}\nPublication: ${options.publication}\nRoute: ${cleanBasePath(options.basePath)}\n\nIf this is a monorepo, identify the target app before editing and install dependencies from the workspace root. Detect whether the app uses the Next.js App Router, Next.js Pages Router, or Astro. Install @prosewire/next or @prosewire/astro. Use the package route helpers and unstyled semantic components. Preserve the existing layout and styles. Do not add a management API key. Verify the production build and report the created routes.`;
}

export async function scaffold(options: ScaffoldOptions) {
  const root = resolve(options.root);
  const basePath = cleanBasePath(options.basePath);
  const detected = await detectFramework(root, options.router);
  const files = detected.framework.startsWith("next")
    ? nextFiles(
        detected.framework as "next-app" | "next-pages",
        detected.sourceRoot,
        options.baseUrl,
        options.publication,
        basePath,
      )
    : astroFiles(
        detected.framework as "astro-static" | "astro-server",
        detected.sourceRoot,
        options.baseUrl,
        options.publication,
        basePath,
      );
  const conflicts: string[] = [];
  for (const path of files.keys())
    if (await exists(path)) conflicts.push(relative(root, path));
  if (conflicts.length > 0)
    throw new Error(
      `Refusing to overwrite existing files: ${conflicts.join(", ")}`,
    );
  for (const [path, contents] of files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
  const manifestPath = join(root, "package.json");
  const manifest = await readManifest(root);
  const packageName = detected.framework.startsWith("next")
    ? "@prosewire/next"
    : "@prosewire/astro";
  const dependencies = {
    ...manifest.dependencies,
    [packageName]: `^${version}`,
  };
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...manifest, dependencies }, null, 2)}\n`,
  );
  if (options.install !== false) {
    const install = await findInstallContext(root);
    const result = spawnSync(install.manager, ["install"], {
      cwd: install.root,
      stdio: "inherit",
    });
    if (result.status !== 0)
      throw new Error(`${install.manager} install failed`);
  }
  return {
    framework: detected.framework,
    files: [...files.keys()].map((path) => relative(root, path)),
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2), {
    agentPrompt,
    resolveProjectRoot,
    scaffold,
  }).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
