import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const published = JSON.parse(process.env.PUBLISHED_PACKAGES ?? "[]");
assert.ok(Array.isArray(published) && published.length > 0);

const packageDirectories = new Map([
  ["@prosewire/sdk", "sdk"],
  ["@prosewire/cli", "cli"],
  ["@prosewire/mcp", "mcp"],
  ["@prosewire/next", "next"],
  ["@prosewire/astro", "astro"],
  ["create-prosewire", "create-prosewire"],
]);

const wait = (milliseconds) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

for (const item of published) {
  assert.equal(typeof item?.name, "string");
  assert.match(item?.version, /^\d+\.\d+\.\d+$/);
  const directory = packageDirectories.get(item.name);
  assert.ok(directory, `Unexpected published package: ${item.name}`);
  const manifest = JSON.parse(
    await readFile(join(root, "packages", directory, "package.json"), "utf8"),
  );
  assert.equal(item.version, manifest.version);

  const url = `https://registry.npmjs.org/${encodeURIComponent(item.name)}/${item.version}`;
  let metadata;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      metadata = await response.json();
      break;
    }
    if (attempt < 12) await wait(5_000);
  }
  assert.ok(metadata, `${item.name}@${item.version} did not reach npm`);
  assert.equal(metadata.name, item.name);
  assert.equal(metadata.version, item.version);
  assert.equal(
    metadata.dist?.attestations?.provenance?.predicateType,
    "https://slsa.dev/provenance/v1",
    `${item.name}@${item.version} has no npm provenance attestation`,
  );
  process.stdout.write(`Verified ${item.name}@${item.version} on npm.\n`);
}

const smoke = spawnSync(
  process.execPath,
  [join(root, "scripts", "package-tarball-smoke.mjs"), "--registry"],
  { cwd: root, encoding: "utf8", stdio: "inherit" },
);
assert.equal(smoke.status, 0, "Published package consumer smoke test failed");
