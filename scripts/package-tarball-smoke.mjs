import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const executable = (name) =>
  join(
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
const npm = join(root, executable("npm"));
const registryMode = process.argv.includes("--registry");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : ""}`,
  );
  return result;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout;
}

function assertCaretAccepts(range, version, packageName) {
  assert.match(range, /^\^\d+\.\d+\.\d+$/);
  const [rangeMajor, rangeMinor, rangePatch] = range
    .slice(1)
    .split(".")
    .map(Number);
  const [major, minor, patch] = version.split(".").map(Number);
  const atLeastMinimum =
    major > rangeMajor ||
    (major === rangeMajor && minor > rangeMinor) ||
    (major === rangeMajor && minor === rangeMinor && patch >= rangePatch);
  const beforeUpperBound =
    rangeMajor > 0
      ? major === rangeMajor
      : rangeMinor > 0
        ? major === 0 && minor === rangeMinor
        : major === 0 && minor === 0 && patch === rangePatch;
  assert.ok(
    atLeastMinimum && beforeUpperBound,
    `${packageName} dependency ${range} does not accept @prosewire/sdk@${version}`,
  );
}

const packages = [
  ["sdk", "@prosewire/sdk"],
  ["cli", "@prosewire/cli"],
  ["mcp", "@prosewire/mcp"],
  ["next", "@prosewire/next"],
  ["astro", "@prosewire/astro"],
  ["create-prosewire", "create-prosewire"],
];
const temporary = await mkdtemp(join(tmpdir(), "prosewire-package-smoke-"));
const tarballs = join(temporary, "tarballs");

try {
  const dependencies = {};
  const manifests = new Map();
  const sourceManifests = new Map();
  for (const [directory, name] of packages)
    sourceManifests.set(
      name,
      JSON.parse(
        await readFile(
          join(root, "packages", directory, "package.json"),
          "utf8",
        ),
      ),
    );

  if (registryMode) {
    for (const [, name] of packages)
      dependencies[name] = sourceManifests.get(name).version;
  } else {
    run(pnpm, [...packages.flatMap(([, name]) => ["--filter", name]), "build"]);
    await mkdir(tarballs);

    for (const [directory, name] of packages) {
      const manifest = sourceManifests.get(name);
      const tarball = join(tarballs, `${directory}-${manifest.version}.tgz`);
      run(pnpm, ["--filter", name, "pack", "--out", tarball]);
      dependencies[name] = `file:${tarball}`;
      const contents = capture("tar", ["-tf", tarball]).trim().split("\n");
      const packedManifest = JSON.parse(
        capture("tar", ["-xOf", tarball, "package/package.json"]),
      );
      manifests.set(name, packedManifest);

      for (const required of [
        "package/package.json",
        "package/README.md",
        "package/CHANGELOG.md",
        "package/LICENSE",
        "package/dist/index.mjs",
        "package/dist/index.d.mts",
      ]) {
        assert.ok(
          contents.includes(required),
          `${name} tarball is missing ${required}`,
        );
      }
      assert.ok(contents.every((path) => !path.startsWith("package/src/")));
      assert.ok(contents.every((path) => !path.includes("tsconfig")));
      assert.equal(packedManifest.name, name);
      assert.equal(packedManifest.version, manifest.version);
      assert.equal(packedManifest.main, manifest.main);
      assert.equal(packedManifest.module, manifest.module);
      assert.equal(packedManifest.types, manifest.types);
      assert.deepEqual(packedManifest.exports, manifest.exports);
      assert.deepEqual(packedManifest.bin, manifest.bin);
      assert.equal(packedManifest.license, "Apache-2.0");
      assert.equal(packedManifest.engines.node, ">=24");
      assert.equal(
        packedManifest.repository.url,
        "https://github.com/prosewire/prosewire.git",
      );
      assert.equal(
        packedManifest.homepage,
        "https://github.com/prosewire/prosewire#readme",
      );
      assert.equal(
        packedManifest.bugs.url,
        "https://github.com/prosewire/prosewire/issues",
      );
      assert.equal(packedManifest.publishConfig.access, "public");
      assert.equal(packedManifest.publishConfig.provenance, true);
      assert.doesNotMatch(JSON.stringify(packedManifest), /workspace:/);

      if (name === "@prosewire/mcp") {
        for (const required of [
          "package/dist/server.mjs",
          "package/dist/server.d.mts",
        ]) {
          assert.ok(
            contents.includes(required),
            `${name} tarball is missing ${required}`,
          );
        }
      }
      if (name === "@prosewire/next") {
        for (const required of [
          "package/dist/app.mjs",
          "package/dist/app.d.mts",
          "package/dist/pages.mjs",
          "package/dist/pages.d.mts",
        ]) {
          assert.ok(
            contents.includes(required),
            `${name} tarball is missing ${required}`,
          );
        }
      }
      if (name === "@prosewire/astro") {
        for (const required of [
          "package/components/PostList.astro",
          "package/components/PostArticle.astro",
          "package/routes/static-index.astro",
          "package/routes/server-post.astro",
          "package/virtual.d.ts",
        ]) {
          assert.ok(
            contents.includes(required),
            `${name} tarball is missing ${required}`,
          );
        }
      }
    }
  }

  await writeFile(
    join(temporary, "package.json"),
    `${JSON.stringify({ private: true, type: "module", dependencies }, null, 2)}\n`,
  );
  await writeFile(
    join(temporary, "consumer.mjs"),
    `import assert from "node:assert/strict";
import { createClient, createPublicClient } from "@prosewire/sdk";
import { createProsewireMcpServer } from "@prosewire/mcp/server";
import { normalizeBasePath as normalizeNextPath } from "@prosewire/next";
import { createProsewireApp } from "@prosewire/next/app";
import { createProsewirePages } from "@prosewire/next/pages";
import { createProsewire as createAstroClient } from "@prosewire/astro";

assert.equal(typeof createClient, "function");
assert.equal(typeof createPublicClient, "function");
assert.equal(typeof createProsewireMcpServer, "function");
assert.equal(normalizeNextPath("blog/"), "/blog");
assert.equal(typeof createProsewireApp, "function");
assert.equal(typeof createProsewirePages, "function");
assert.equal(typeof createAstroClient, "function");
`,
  );
  await writeFile(
    join(temporary, "consumer.ts"),
    `import { createClient, type Client } from "@prosewire/sdk";
import { createProsewireMcpServer } from "@prosewire/mcp/server";
import { type ProsewireNextOptions } from "@prosewire/next";
import { createProsewireApp } from "@prosewire/next/app";
import { createProsewirePages } from "@prosewire/next/pages";
import { createProsewire } from "@prosewire/astro";

const client: Client = createClient({ baseUrl: "https://example.com" });
createProsewireMcpServer(client);
const options: ProsewireNextOptions = { baseUrl: "https://example.com", publication: "fieldnotes" };
createProsewireApp(options);
createProsewirePages(options);
createProsewire({ ...options });
`,
  );

  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: temporary,
  });

  if (registryMode) {
    for (const [directory, name] of packages) {
      const installedPath = name.startsWith("@prosewire/")
        ? join(
            temporary,
            "node_modules",
            "@prosewire",
            directory,
            "package.json",
          )
        : join(temporary, "node_modules", name, "package.json");
      const manifest = JSON.parse(await readFile(installedPath, "utf8"));
      assert.equal(manifest.version, sourceManifests.get(name).version);
      manifests.set(name, manifest);
    }
  }

  const sdkVersion = manifests.get("@prosewire/sdk").version;
  assertCaretAccepts(
    manifests.get("@prosewire/cli").dependencies["@prosewire/sdk"],
    sdkVersion,
    "@prosewire/cli",
  );
  assertCaretAccepts(
    manifests.get("@prosewire/mcp").dependencies["@prosewire/sdk"],
    sdkVersion,
    "@prosewire/mcp",
  );
  assertCaretAccepts(
    manifests.get("@prosewire/next").dependencies["@prosewire/sdk"],
    sdkVersion,
    "@prosewire/next",
  );
  assertCaretAccepts(
    manifests.get("@prosewire/astro").dependencies["@prosewire/sdk"],
    sdkVersion,
    "@prosewire/astro",
  );

  const sdkDeclarations = await readFile(
    join(temporary, "node_modules", "@prosewire", "sdk", "dist", "index.d.mts"),
    "utf8",
  );
  assert.doesNotMatch(sdkDeclarations, /@prosewire\/contract/);
  const cliDeclarations = await readFile(
    join(temporary, "node_modules", "@prosewire", "cli", "dist", "index.d.mts"),
    "utf8",
  );
  const mcpDeclarations = await readFile(
    join(
      temporary,
      "node_modules",
      "@prosewire",
      "mcp",
      "dist",
      "server.d.mts",
    ),
    "utf8",
  );
  assert.doesNotMatch(cliDeclarations, /@prosewire\/contract/);
  assert.doesNotMatch(mcpDeclarations, /@prosewire\/contract/);
  for (const directory of ["next", "astro"]) {
    const declarations = await readFile(
      join(
        temporary,
        "node_modules",
        "@prosewire",
        directory,
        "dist",
        "index.d.mts",
      ),
      "utf8",
    );
    assert.doesNotMatch(declarations, /workspace:/);
  }
  run(process.execPath, [join(temporary, "consumer.mjs")], { cwd: temporary });
  run(
    join(root, executable("tsc")),
    [
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--skipLibCheck",
      "true",
      join(temporary, "consumer.ts"),
    ],
    { cwd: temporary },
  );

  const cli = spawnSync(executable("prosewire"), ["--help"], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(
    cli.stdout,
    /Publish and retrieve portable content from Prosewire/,
  );

  const cliVersionResult = spawnSync(executable("prosewire"), ["--version"], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.equal(cliVersionResult.status, 0, cliVersionResult.stderr);
  assert.ok(
    cliVersionResult.stdout.includes(manifests.get("@prosewire/cli").version),
  );

  const mcp = spawnSync(executable("prosewire-mcp"), [], {
    cwd: temporary,
    encoding: "utf8",
    env: { ...process.env, PROSEWIRE_API_KEY: "" },
  });
  assert.equal(mcp.status, 2, mcp.stderr);
  assert.match(mcp.stderr, /PROSEWIRE_API_KEY is required/);

  const create = spawnSync(
    executable("create-prosewire"),
    ["--url", "https://example.com", "--blog", "fieldnotes", "--agent"],
    {
      cwd: temporary,
      encoding: "utf8",
    },
  );
  assert.equal(create.status, 0, create.stderr);
  assert.match(create.stdout, /Preserve the existing layout and styles/);

  const workspaceApp = join(temporary, "apps", "web");
  await mkdir(join(workspaceApp, "src", "app"), { recursive: true });
  await writeFile(
    join(workspaceApp, "package.json"),
    `${JSON.stringify({ name: "web", dependencies: { next: "16.3.1" } }, null, 2)}\n`,
  );
  const createInWorkspace = spawnSync(
    executable("create-prosewire"),
    [
      "--cwd",
      "apps/web",
      "--url",
      "https://example.com",
      "--blog",
      "fieldnotes",
      "--no-install",
    ],
    {
      cwd: temporary,
      encoding: "utf8",
    },
  );
  assert.equal(createInWorkspace.status, 0, createInWorkspace.stderr);
  assert.match(
    createInWorkspace.stdout,
    /Added Prosewire to apps[/\\]web for next-app/,
  );
  const workspaceManifest = JSON.parse(
    await readFile(join(workspaceApp, "package.json"), "utf8"),
  );
  assert.match(
    workspaceManifest.dependencies["@prosewire/next"],
    /^\^\d+\.\d+\.\d+$/,
  );
  assert.match(
    await readFile(
      join(workspaceApp, "src", "app", "blog", "page.tsx"),
      "utf8",
    ),
    /blog\.index\.Page/,
  );

  process.stdout.write("Package tarball consumer smoke tests passed.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
