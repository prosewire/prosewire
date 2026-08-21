import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkManifest = JSON.parse(
  await readFile(join(root, "packages", "sdk", "package.json"), "utf8"),
);

for (const directory of ["cli", "mcp", "create-prosewire"]) {
  const manifestPath = join(root, "packages", directory, "package.json");
  const versionPath = join(root, "packages", directory, "src", "version.ts");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const source = await readFile(versionPath, "utf8");
  assert.match(
    source,
    /export const version = "[^"]+";/,
    `${versionPath} does not contain the version marker`,
  );
  const next = source.replace(
    /export const version = "[^"]+";/,
    `export const version = "${manifest.version}";`,
  );
  if (next !== source) await writeFile(versionPath, next);
}

const rootManifestPath = join(root, "package.json");
const rootManifest = JSON.parse(await readFile(rootManifestPath, "utf8"));
rootManifest.version = sdkManifest.version;
await writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`);

const webVersionPath = join(root, "apps", "web", "src", "server", "version.ts");
const webVersion = await readFile(webVersionPath, "utf8");
assert.match(webVersion, /export const version = "[^"]+";/);
const nextWebVersion = webVersion.replace(
  /export const version = "[^"]+";/,
  `export const version = "${sdkManifest.version}";`,
);
if (nextWebVersion !== webVersion)
  await writeFile(webVersionPath, nextWebVersion);

process.stdout.write("Synchronized public package and runtime versions.\n");
