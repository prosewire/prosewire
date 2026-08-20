import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const executable = (name) =>
  join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

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

const packages = [
  ["sdk", "@prosewire/sdk"],
  ["cli", "@prosewire/cli"],
  ["mcp", "@prosewire/mcp"],
];
const temporary = await mkdtemp(join(tmpdir(), "prosewire-package-smoke-"));
const tarballs = join(temporary, "tarballs");

try {
  run(pnpm, [...packages.flatMap(([, name]) => ["--filter", name]), "build"]);
  await mkdir(tarballs);

  const dependencies = {};
  for (const [directory, name] of packages) {
    const manifest = JSON.parse(
      await readFile(join(root, "packages", directory, "package.json"), "utf8"),
    );
    const tarball = join(tarballs, `${directory}-${manifest.version}.tgz`);
    run(pnpm, ["--filter", name, "pack", "--out", tarball]);
    dependencies[name] = `file:${tarball}`;
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

assert.equal(typeof createClient, "function");
assert.equal(typeof createPublicClient, "function");
assert.equal(typeof createProsewireMcpServer, "function");
`,
  );
  await writeFile(
    join(temporary, "consumer.ts"),
    `import { createClient, type Client } from "@prosewire/sdk";
import { createProsewireMcpServer } from "@prosewire/mcp/server";

const client: Client = createClient({ baseUrl: "https://example.com" });
createProsewireMcpServer(client);
`,
  );

  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: temporary,
  });
  const sdkDeclarations = await readFile(
    join(temporary, "node_modules", "@prosewire", "sdk", "dist", "index.d.mts"),
    "utf8",
  );
  assert.doesNotMatch(sdkDeclarations, /@prosewire\/contract/);
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
  assert.match(cli.stdout, /Publish and retrieve portable content from Prosewire/);

  const mcp = spawnSync(executable("prosewire-mcp"), [], {
    cwd: temporary,
    encoding: "utf8",
    env: { ...process.env, PROSEWIRE_API_KEY: "" },
  });
  assert.equal(mcp.status, 2, mcp.stderr);
  assert.match(mcp.stderr, /PROSEWIRE_API_KEY is required/);

  process.stdout.write("Package tarball consumer smoke tests passed.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
