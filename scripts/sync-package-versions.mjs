import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const directory of ["cli", "mcp"]) {
  const manifestPath = join(root, "packages", directory, "package.json");
  const versionPath = join(root, "packages", directory, "src", "version.ts");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const source = await readFile(versionPath, "utf8");
  if (!/export const version = "[^"]+";/.test(source))
    throw new Error(`${versionPath} does not contain the version marker`);
  const next = source.replace(
    /export const version = "[^"]+";/,
    `export const version = "${manifest.version}";`,
  );
  if (next !== source) await writeFile(versionPath, next);
}

process.stdout.write("Synchronized package-owned runtime versions.\n");
