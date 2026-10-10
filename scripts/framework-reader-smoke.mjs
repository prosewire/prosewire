import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const readers = [
  {
    framework: "next-app",
    tool: "next",
    integration: "@prosewire/next",
    routes: ["/journal"],
  },
  {
    framework: "next-pages",
    tool: "next",
    integration: "@prosewire/next",
    routes: ["/journal"],
  },
  {
    framework: "astro-static",
    tool: "astro",
    integration: "@prosewire/astro",
    routes: ["/journal", "/injected"],
  },
  {
    framework: "astro-server",
    tool: "astro",
    integration: "@prosewire/astro",
    routes: ["/journal", "/injected"],
  },
];
const publication = "acceptance-fieldnotes";
const publishedSlug = "acceptance-published";
const privateSlugs = [
  "acceptance-draft",
  "acceptance-scheduled",
  "acceptance-archived",
  "acceptance-future-published",
  "other-tenant-secret",
  "acceptance-missing",
];
const binary = (directory, name) =>
  join(directory, "node_modules", ".bin", name);
const save = async (directory, file, contents) => {
  const target = join(directory, file);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, contents);
};

async function get(url) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

async function verifyBackend(baseUrl) {
  const api = `${baseUrl}/api/public/${publication}/posts`;
  const result = await get(api);
  assert.equal(result.status, 200, "Acceptance publication must exist");
  const body = await result.text();
  assert.ok(body.includes(publishedSlug));
  for (const slug of privateSlugs) {
    assert.ok(!body.includes(slug), `Public list exposed ${slug}`);
    assert.equal((await get(`${api}/${slug}`)).status, 404, slug);
  }
  const renamed = await get(`${api}/acceptance-original`);
  assert.equal(renamed.status, 301, "Seed the known old-slug redirect");
  assert.equal(
    renamed.headers.get("location"),
    `/api/public/${publication}/posts/${publishedSlug}`,
  );
}

async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForReader(server, url, output) {
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, output());
    try {
      if ((await get(url)).status === 200) return;
    } catch {
      // Wait only for the listener owned by this fixture.
    }
    await delay(250);
  }
  assert.fail(output());
}

async function verifyRoute(directory, framework, origin, route) {
  const index = await get(`${origin}${route}`);
  assert.equal(index.status, 200, `${framework} index`);
  const indexHtml = await index.text();
  assert.match(indexHtml, /<main[^>]*class="[^"]*pw-index/);
  assert.ok(indexHtml.includes(`${route}/${publishedSlug}`));
  for (const slug of privateSlugs) {
    assert.ok(!indexHtml.includes(slug), `${framework} index exposed ${slug}`);
    const hidden = await get(`${origin}${route}/${slug}`);
    assert.equal(hidden.status, 404, `${framework}: ${slug}`);
  }
  const article = await get(`${origin}${route}/${publishedSlug}`);
  assert.equal(article.status, 200, `${framework} article`);
  const articleHtml = await article.text();
  assert.ok(
    /<main[^>]*class="[^"]*pw-post/.test(articleHtml),
    `${framework} article hooks`,
  );
  assert.ok(articleHtml.includes("<article>"), `${framework} semantic article`);
  assert.match(articleHtml, /Portable publishing/);
  const renamed = await get(`${origin}${route}/acceptance-original`);
  if (framework === "astro-static") {
    assert.equal(renamed.status, 200);
    assert.match(await renamed.text(), /http-equiv="refresh"/);
    const html = await readFile(
      join(directory, "dist", route, "acceptance-original", "index.html"),
      "utf8",
    );
    assert.ok(html.includes(`${route}/${publishedSlug}`));
  } else {
    assert.ok(
      [301, 308].includes(renamed.status),
      `${framework} old slug: ${renamed.status}`,
    );
    assert.equal(renamed.headers.get("location"), `${route}/${publishedSlug}`);
  }
}

async function stopReader(server) {
  if (server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    const forceStop = setTimeout(() => server.kill("SIGKILL"), 5_000);
    await stopped;
    clearTimeout(forceStop);
  }
}

function readerCommand(directory, framework, port) {
  if (framework === "astro-server")
    return [process.execPath, [join(directory, "dist/server/entry.mjs")]];
  if (framework.startsWith("next"))
    return [
      binary(directory, "next"),
      ["start", "--hostname", "127.0.0.1", "--port", String(port)],
    ];
  // Astro defaults to a daemon for agents; keep the child in the foreground.
  return [
    binary(directory, "astro"),
    ["preview", "--ignore-lock", "--host", "127.0.0.1", "--port", String(port)],
  ];
}

async function serveAndVerify(directory, framework, routes) {
  const port = await freePort();
  const [command, args] = readerCommand(directory, framework, port);
  const server = spawn(command, args, {
    cwd: directory,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
      ASTRO_TELEMETRY_DISABLED: "1",
    },
  });
  let output = "";
  const remember = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
  };
  server.stdout.on("data", remember);
  server.stderr.on("data", remember);
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForReader(server, `${origin}${routes[0]}`, () => output);
    for (const route of routes)
      await verifyRoute(directory, framework, origin, route);
    process.stdout.write(
      `Fresh ${framework} production reader passed (${routes.join(", ")}).\n`,
    );
  } catch (error) {
    process.stderr.write(output);
    throw error;
  } finally {
    await stopReader(server);
  }
}

function frameworkDependencies(framework, nextManifest, astroManifest) {
  if (framework.startsWith("next"))
    return {
      next: nextManifest.devDependencies.next,
      react: nextManifest.devDependencies.react,
      "react-dom": nextManifest.devDependencies["react-dom"],
      "@types/react": nextManifest.devDependencies["@types/react"],
      "@types/node": nextManifest.devDependencies["@types/node"],
      typescript: "7.0.2",
    };
  return {
    astro: astroManifest.devDependencies.astro,
    ...(framework === "astro-server" ? { "@astrojs/node": "11.1.7" } : {}),
  };
}

async function prepareAstroConfig(directory, framework, baseUrl) {
  const serverConfig =
    framework === "astro-server" ? 'import node from "@astrojs/node";\n' : "";
  const output =
    framework === "astro-server"
      ? 'output: "server", adapter: node({ mode: "standalone" }),'
      : 'output: "static",';
  await save(
    directory,
    "astro.config.mjs",
    `${serverConfig}import { defineConfig } from "astro/config";\nimport prosewire from "@prosewire/astro";\nexport default defineConfig({ ${output} integrations: [prosewire({ baseUrl: ${JSON.stringify(baseUrl)}, publication: ${JSON.stringify(publication)}, basePath: "/injected" })] });\n`,
  );
}

async function prepareFixture({
  directory,
  reader,
  baseUrl,
  dependencies,
  nextManifest,
  astroManifest,
}) {
  const { framework, integration, tool } = reader;
  const isNext = tool === "next";
  const manifest = {
    name: `fresh-${framework}`,
    private: true,
    type: "module",
    dependencies: {
      "create-prosewire": dependencies["create-prosewire"],
      "@prosewire/sdk": dependencies["@prosewire/sdk"],
      [integration]: dependencies[integration],
      ...frameworkDependencies(framework, nextManifest, astroManifest),
    },
  };
  await save(
    directory,
    "package.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (isNext) {
    await save(
      directory,
      "next.config.mjs",
      'import { fileURLToPath } from "node:url";\nconst root = fileURLToPath(new URL(".", import.meta.url));\nexport default { turbopack: { root }, outputFileTracingRoot: root };\n',
    );
  }
  if (framework === "next-app") {
    await save(
      directory,
      "src/app/layout.tsx",
      'export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n',
    );
  } else if (framework === "next-pages") {
    await mkdir(join(directory, "src/pages"), { recursive: true });
  } else {
    await mkdir(join(directory, "src/pages"), { recursive: true });
    await prepareAstroConfig(directory, framework, baseUrl);
  }
}

async function restoreLocalTarball(directory, integration, specification) {
  // Local tarballs stand in for the registry range written by the real CLI.
  if (specification.startsWith("file:")) {
    const scaffolded = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    scaffolded.dependencies[integration] = specification;
    await save(
      directory,
      "package.json",
      `${JSON.stringify(scaffolded, null, 2)}\n`,
    );
  }
}

export async function verifyFreshReaders({
  root,
  temporary,
  dependencies,
  npm,
  run,
}) {
  const baseUrl = process.env.PROSEWIRE_ONBOARDING_URL.replace(/\/$/, "");
  await verifyBackend(baseUrl);
  const nextManifest = JSON.parse(
    await readFile(join(root, "packages/next/package.json"), "utf8"),
  );
  const astroManifest = JSON.parse(
    await readFile(join(root, "packages/astro/package.json"), "utf8"),
  );
  for (const reader of readers) {
    const { framework, integration, tool, routes } = reader;
    const directory = join(temporary, framework);
    await prepareFixture({
      directory,
      reader,
      baseUrl,
      dependencies,
      nextManifest,
      astroManifest,
    });
    const options = {
      cwd: directory,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
      },
    };
    run(npm, ["install", "--no-audit", "--no-fund"], options);
    run(
      binary(directory, "create-prosewire"),
      [
        "--url",
        baseUrl,
        "--blog",
        publication,
        "--route",
        "/journal",
        "--no-install",
      ],
      options,
    );
    await restoreLocalTarball(
      directory,
      integration,
      dependencies[integration],
    );
    run(npm, ["install", "--no-audit", "--no-fund"], options);
    const installed = JSON.parse(
      await readFile(
        join(directory, "node_modules", integration, "package.json"),
        "utf8",
      ),
    );
    process.stdout.write(
      `${framework} installed ${integration}@${installed.version}\n`,
    );
    run(binary(directory, tool), ["build"], options);
    await serveAndVerify(directory, framework, routes);
  }
}
