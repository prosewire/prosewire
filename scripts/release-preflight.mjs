import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "https://github.com/prosewire/prosewire.git";
const homepage = "https://github.com/prosewire/prosewire#readme";
const bugs = "https://github.com/prosewire/prosewire/issues";
const packages = [
  { directory: "sdk", name: "@prosewire/sdk", bins: [] },
  { directory: "cli", name: "@prosewire/cli", bins: ["prosewire"] },
  { directory: "mcp", name: "@prosewire/mcp", bins: ["prosewire-mcp"] },
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const changesetFiles = (await readdir(join(root, ".changeset")))
  .filter((file) => file.endsWith(".md") && file !== "README.md");
check(
  changesetFiles.length === 0,
  `unconsumed Changesets remain: ${changesetFiles.join(", ")}`,
);

const changesetConfig = JSON.parse(
  await readFile(join(root, ".changeset", "config.json"), "utf8"),
);
const linked = changesetConfig.linked?.[0] ?? [];
check(
  packages.every(({ name }) => linked.includes(name)) && linked.length === packages.length,
  "the SDK, CLI, and MCP packages must remain in one Changesets linked group",
);

const manifests = new Map();
for (const definition of packages) {
  const packageRoot = join(root, "packages", definition.directory);
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  manifests.set(definition.name, manifest);

  check(manifest.name === definition.name, `${definition.name}: manifest name is incorrect`);
  check(/^\d+\.\d+\.\d+$/.test(manifest.version), `${definition.name}: version must be plain semver`);
  check(manifest.license === "Apache-2.0", `${definition.name}: license must be Apache-2.0`);
  check(manifest.engines?.node === ">=24", `${definition.name}: Node engine must be >=24`);
  check(manifest.repository?.type === "git", `${definition.name}: repository type is missing`);
  check(manifest.repository?.url === repository, `${definition.name}: repository URL is incorrect`);
  check(
    manifest.repository?.directory === `packages/${definition.directory}`,
    `${definition.name}: repository directory is incorrect`,
  );
  check(manifest.homepage === homepage, `${definition.name}: homepage is incorrect`);
  check(manifest.bugs?.url === bugs, `${definition.name}: bugs URL is incorrect`);
  check(manifest.publishConfig?.access === "public", `${definition.name}: npm access must be public`);
  check(manifest.publishConfig?.provenance === true, `${definition.name}: npm provenance must be enabled`);
  check(manifest.files?.includes("dist"), `${definition.name}: dist is not included in the tarball`);
  check(manifest.files?.includes("README.md"), `${definition.name}: README is not included in the tarball`);
  check(manifest.files?.includes("CHANGELOG.md"), `${definition.name}: changelog is not included in the tarball`);

  for (const bin of definition.bins) {
    check(typeof manifest.bin?.[bin] === "string", `${definition.name}: ${bin} binary is missing`);
  }

  const changelog = await readFile(join(packageRoot, "CHANGELOG.md"), "utf8");
  check(
    changelog.includes(`## ${manifest.version}`),
    `${definition.name}: changelog has no entry for ${manifest.version}`,
  );
}

const versions = new Set([...manifests.values()].map((manifest) => manifest.version));
check(versions.size === 1, "linked public package versions are not aligned");
const publicVersion = [...versions][0];
const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
check(rootManifest.version === publicVersion, "root release version is not aligned");
const webVersion = await readFile(
  join(root, "apps", "web", "src", "server", "version.ts"),
  "utf8",
);
check(
  webVersion.includes(`export const version = "${publicVersion}";`),
  "web health version is not aligned",
);

for (const directory of ["cli", "mcp"]) {
  const manifest = manifests.get(`@prosewire/${directory}`);
  const sdkVersion = manifests.get("@prosewire/sdk").version;
  check(
    manifest.dependencies?.["@prosewire/sdk"] === "workspace:^",
    `@prosewire/${directory}: source dependency on the SDK must use workspace:^`,
  );
  const runtimeVersion = await readFile(
    join(root, "packages", directory, "src", "version.ts"),
    "utf8",
  );
  check(
    runtimeVersion.includes(`export const version = "${manifest.version}";`),
    `@prosewire/${directory}: runtime version does not match the manifest; run pnpm version-packages`,
  );
  check(/^\d+\.\d+\.\d+$/.test(sdkVersion), "SDK version is not plain semver");
}

if (failures.length > 0) {
  process.stderr.write("Release preflight failed:\n");
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  const version = publicVersion;
  assert.ok(version);
  process.stdout.write(
    `Release metadata is consistent for SDK, CLI, and MCP ${version}; no Changesets remain.\n`,
  );
}
