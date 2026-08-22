import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";

const publicPackages = [
  "sdk",
  "cli",
  "mcp",
  "next",
  "astro",
  "create-prosewire",
];
const sdkConsumers = ["cli", "mcp", "next", "astro"];
const zeroSha = /^0{40}$/;
const fullSha = /^[0-9a-f]{40}$/;

function matches(path, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern,
  );
}

function isDependencyInput(path) {
  return (
    path === "package.json" ||
    path === "pnpm-lock.yaml" ||
    path === "pnpm-workspace.yaml" ||
    path === ".npmrc" ||
    path === ".pnpmfile.cjs" ||
    path.startsWith("patches/") ||
    /^(apps|packages)\/[^/]+\/package\.json$/.test(path)
  );
}

function isPackageTest(path) {
  return /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec)\.[^/]+)$/.test(path);
}

function publicPackageFor(path) {
  return publicPackages.find((directory) =>
    path.startsWith(`packages/${directory}/`),
  );
}

function addPackageCoverage(selected, directory) {
  selected.add(directory);
  if (sdkConsumers.includes(directory)) selected.add("sdk");
  if (directory === "sdk") {
    for (const consumer of sdkConsumers) selected.add(consumer);
  }
}

export function classifyPaths(
  paths,
  { versionOnlyManifests = new Set(), conservative = false } = {},
) {
  const changed = [...new Set(paths)].sort();
  const workflowOrClassifier = changed.some(
    (path) =>
      path.startsWith(".github/workflows/") ||
      path === "scripts/ci-change-classifier.mjs" ||
      path === "scripts/ci-change-classifier.test.mjs",
  );
  const fullValidation = conservative || workflowOrClassifier;
  const dependencyAudit =
    fullValidation || changed.some((path) => isDependencyInput(path));
  const sharedQuality = changed.some((path) =>
    matches(path, [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
      "tsconfig.json",
      "biome.json",
      ".npmrc",
      ".pnpmfile.cjs",
      "patches/",
      "packages/config/",
      "packages/contract/",
      "scripts/package-tarball-smoke.mjs",
      "scripts/release-preflight.mjs",
      "scripts/sync-package-versions.mjs",
    ]),
  );

  const runtimePaths = [
    "apps/web/",
    "apps/worker/",
    "packages/config/",
    "packages/contract/",
    "packages/core/",
    "packages/db/",
    "packages/sdk/src/",
    "packages/sdk/tsconfig.json",
    "packages/sdk/vitest.config.mjs",
    "Dockerfile",
    ".dockerignore",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    "docker-compose.cloud.yml",
    "scripts/container-runtime-smoke.sh",
  ];
  const imagePaths = [
    "apps/web/",
    "apps/worker/",
    "packages/config/",
    "packages/contract/",
    "packages/core/",
    "packages/db/",
    "Dockerfile",
    ".dockerignore",
  ];
  const sharedRuntimeInputs = new Set([
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.json",
  ]);
  const copiedDockerManifests = new Set([
    "apps/web/package.json",
    "apps/worker/package.json",
    "apps/site/package.json",
    "packages/config/package.json",
    "packages/contract/package.json",
    "packages/core/package.json",
    "packages/db/package.json",
    "packages/sdk/package.json",
    "packages/cli/package.json",
    "packages/mcp/package.json",
  ]);

  let integration = fullValidation;
  let edgeImage = fullValidation;
  for (const path of changed) {
    const versionOnly = versionOnlyManifests.has(path);
    if (sharedRuntimeInputs.has(path)) {
      integration = true;
      edgeImage = true;
    }
    if (!versionOnly && matches(path, runtimePaths)) integration = true;
    const validationOnly =
      isPackageTest(path) ||
      path.startsWith("apps/web/acceptance/") ||
      path === "apps/web/playwright.config.ts";
    if (!versionOnly && !validationOnly && matches(path, imagePaths))
      edgeImage = true;
    if (!versionOnly && copiedDockerManifests.has(path)) {
      integration = true;
      edgeImage = true;
    }
  }

  const packageSmoke = new Set();
  if (fullValidation || sharedQuality) {
    for (const directory of publicPackages) packageSmoke.add(directory);
  } else {
    for (const path of changed) {
      const directory = publicPackageFor(path);
      if (directory) addPackageCoverage(packageSmoke, directory);
    }
  }

  const releaseInfrastructure = changed.some((path) =>
    matches(path, [
      ".changeset/",
      "scripts/release-preflight.mjs",
      "scripts/sync-package-versions.mjs",
    ]),
  );
  const packageRelease =
    releaseInfrastructure ||
    changed.some((path) => {
      const directory = publicPackageFor(path);
      return directory !== undefined && !isPackageTest(path);
    });

  return {
    dependency_audit: dependencyAudit,
    edge_image: edgeImage,
    full_quality: fullValidation || sharedQuality,
    integration,
    package_release: packageRelease,
    package_smoke: publicPackages
      .filter((directory) => packageSmoke.has(directory))
      .join(","),
  };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function requireCommit(sha, label) {
  if (!fullSha.test(sha)) throw new Error(`${label} is not a full commit SHA`);
  execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
    stdio: "ignore",
  });
}

async function versionOnlyManifest(path, baseSha, headSha) {
  if (!/^packages\/[^/]+\/package\.json$/.test(path)) return false;
  try {
    const before = JSON.parse(git("show", `${baseSha}:${path}`));
    const after = JSON.parse(git("show", `${headSha}:${path}`));
    delete before.version;
    delete after.version;
    return JSON.stringify(before) === JSON.stringify(after);
  } catch {
    return false;
  }
}

export async function classifyGitRange({ eventName, baseSha, headSha }) {
  if (eventName === "workflow_dispatch" || zeroSha.test(baseSha ?? "")) {
    return {
      base_sha: baseSha ?? "",
      head_sha: headSha ?? "",
      ...classifyPaths([], { conservative: true }),
    };
  }

  requireCommit(baseSha, "base SHA");
  requireCommit(headSha, "head SHA");
  const paths = git(
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    baseSha,
    headSha,
  )
    .split("\0")
    .filter(Boolean);
  const versionOnlyManifests = new Set();
  for (const path of paths) {
    if (await versionOnlyManifest(path, baseSha, headSha))
      versionOnlyManifests.add(path);
  }
  return {
    base_sha: baseSha,
    head_sha: headSha,
    ...classifyPaths(paths, { versionOnlyManifests }),
  };
}

async function main() {
  const [eventName, baseSha = "", headSha = "", outputPath] =
    process.argv.slice(2);
  if (!eventName || !outputPath)
    throw new Error("event name and GitHub output path are required");

  let result;
  try {
    result = await classifyGitRange({ eventName, baseSha, headSha });
  } catch (error) {
    process.stderr.write(
      `Change classification failed; using conservative validation: ${error.message}\n`,
    );
    result = {
      base_sha: baseSha ?? "",
      head_sha: headSha ?? "",
      ...classifyPaths([], { conservative: true }),
    };
  }
  await appendFile(
    outputPath,
    `${Object.entries(result)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("\n")}\n`,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
