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
  { directory: "next", name: "@prosewire/next", bins: [] },
  { directory: "astro", name: "@prosewire/astro", bins: [] },
  {
    directory: "create-prosewire",
    name: "create-prosewire",
    bins: ["create-prosewire"],
  },
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const changesetFiles = (await readdir(join(root, ".changeset"))).filter(
  (file) => file.endsWith(".md") && file !== "README.md",
);
check(
  changesetFiles.length === 0,
  `unconsumed Changesets remain: ${changesetFiles.join(", ")}`,
);

const changesetConfig = JSON.parse(
  await readFile(join(root, ".changeset", "config.json"), "utf8"),
);
check(
  Array.isArray(changesetConfig.linked) && changesetConfig.linked.length === 0,
  "public packages must not be coupled through Changesets linked groups",
);

const manifests = new Map();
for (const definition of packages) {
  const packageRoot = join(root, "packages", definition.directory);
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  manifests.set(definition.name, manifest);

  check(
    manifest.name === definition.name,
    `${definition.name}: manifest name is incorrect`,
  );
  check(
    /^\d+\.\d+\.\d+$/.test(manifest.version),
    `${definition.name}: version must be plain semver`,
  );
  check(
    manifest.license === "Apache-2.0",
    `${definition.name}: license must be Apache-2.0`,
  );
  check(
    manifest.engines?.node === ">=24",
    `${definition.name}: Node engine must be >=24`,
  );
  check(
    manifest.repository?.type === "git",
    `${definition.name}: repository type is missing`,
  );
  check(
    manifest.repository?.url === repository,
    `${definition.name}: repository URL is incorrect`,
  );
  check(
    manifest.repository?.directory === `packages/${definition.directory}`,
    `${definition.name}: repository directory is incorrect`,
  );
  check(
    manifest.homepage === homepage,
    `${definition.name}: homepage is incorrect`,
  );
  check(
    manifest.bugs?.url === bugs,
    `${definition.name}: bugs URL is incorrect`,
  );
  check(
    manifest.publishConfig?.access === "public",
    `${definition.name}: npm access must be public`,
  );
  check(
    manifest.publishConfig?.provenance === true,
    `${definition.name}: npm provenance must be enabled`,
  );
  check(
    manifest.files?.includes("dist"),
    `${definition.name}: dist is not included in the tarball`,
  );
  check(
    manifest.files?.includes("README.md"),
    `${definition.name}: README is not included in the tarball`,
  );
  check(
    manifest.files?.includes("CHANGELOG.md"),
    `${definition.name}: changelog is not included in the tarball`,
  );

  for (const bin of definition.bins) {
    check(
      typeof manifest.bin?.[bin] === "string",
      `${definition.name}: ${bin} binary is missing`,
    );
  }

  const changelog = await readFile(join(packageRoot, "CHANGELOG.md"), "utf8");
  check(
    changelog.includes(`## ${manifest.version}`),
    `${definition.name}: changelog has no entry for ${manifest.version}`,
  );
}

for (const directory of ["cli", "mcp"]) {
  const manifest = manifests.get(`@prosewire/${directory}`);
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
}

for (const directory of ["next", "astro"]) {
  const manifest = manifests.get(`@prosewire/${directory}`);
  check(
    manifest.dependencies?.["@prosewire/sdk"] === "workspace:^",
    `@prosewire/${directory}: source dependency on the SDK must use workspace:^`,
  );
}

const createVersions = await readFile(
  join(root, "packages", "create-prosewire", "src", "version.ts"),
  "utf8",
);
for (const name of ["@prosewire/next", "@prosewire/astro"]) {
  const escapedName = name.replace("/", "\\/");
  check(
    new RegExp(`"${escapedName}": "\\d+\\.\\d+\\.\\d+"`).test(createVersions),
    `create-prosewire: ${name} target must be a plain semver`,
  );
}

if (failures.length > 0) {
  process.stderr.write("Release preflight failed:\n");
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Release metadata is consistent for independently versioned public packages; no Changesets remain.\n",
  );
}
