import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";

const fullSha = /^[0-9a-f]{40}$/;
const zeroSha = /^0{40}$/;

const runtimeRoots = [
  "apps/web/",
  "apps/worker/",
  "packages/config/",
  "packages/contract/",
  "packages/core/",
  "packages/db/",
  "packages/jobs/",
  "patches/",
];

const runtimeFiles = new Set([
  ".dockerignore",
  ".npmrc",
  ".pnpmfile.cjs",
  "Dockerfile",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "turbo.json",
]);

const nonRuntimeRoots = [
  ".changeset/",
  "apps/site/",
  "docs/",
  "packages/astro/",
  "packages/cli/",
  "packages/create-prosewire/",
  "packages/mcp/",
  "packages/next/",
  "packages/sdk/",
];

function isDocumentation(path) {
  return path.endsWith(".md") || path.endsWith(".mdx");
}

function isTest(path) {
  return (
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/.test(path) ||
    path.startsWith("apps/web/acceptance/") ||
    path === "apps/web/playwright.config.ts"
  );
}

function isRuntimeInput(path) {
  if (isDocumentation(path) || isTest(path)) return false;
  return (
    runtimeFiles.has(path) || runtimeRoots.some((root) => path.startsWith(root))
  );
}

function isKnownNonRuntimeInput(path) {
  return (
    isDocumentation(path) ||
    isTest(path) ||
    nonRuntimeRoots.some((root) => path.startsWith(root))
  );
}

export function requiresEdgeImage(paths) {
  const changed = [...new Set(paths)];
  if (changed.some((path) => isRuntimeInput(path))) return true;
  if (!changed.includes("pnpm-lock.yaml")) return false;

  const companionChanges = changed.filter((path) => path !== "pnpm-lock.yaml");
  if (companionChanges.length === 0) return true;
  return !companionChanges.every((path) => isKnownNonRuntimeInput(path));
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

export function changedPaths(baseSha, headSha) {
  if (zeroSha.test(baseSha ?? "")) return null;
  requireCommit(baseSha, "base SHA");
  requireCommit(headSha, "head SHA");
  return git("diff", "--name-only", "--no-renames", "-z", baseSha, headSha)
    .split("\0")
    .filter(Boolean);
}

async function main() {
  const [baseSha = "", headSha = "", outputPath] = process.argv.slice(2);
  if (!outputPath)
    throw new Error("base SHA, head SHA, and output path are required");

  let paths;
  let required;
  try {
    paths = changedPaths(baseSha, headSha);
    required = paths === null || requiresEdgeImage(paths);
  } catch (error) {
    process.stderr.write(
      `Edge image classification failed; building conservatively: ${error.message}\n`,
    );
    paths = null;
    required = true;
  }

  await appendFile(outputPath, `edge_required=${String(required)}\n`);
  process.stdout.write(
    `${JSON.stringify({ edge_required: required, paths }, null, 2)}\n`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
