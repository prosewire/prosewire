import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedPaths, requiresEdgeImage } from "./edge-image-change.mjs";

test("runtime source and build inputs require an edge image", () => {
  for (const path of [
    "apps/web/src/app/page.tsx",
    "apps/worker/src/index.ts",
    "packages/core/src/index.ts",
    "packages/db/drizzle/0001.sql",
    "packages/jobs/src/index.ts",
    "Dockerfile",
    "package.json",
  ]) {
    assert.equal(requiresEdgeImage([path]), true, path);
  }
});

test("site, documentation, tests, and integration packages skip edge", () => {
  for (const path of [
    "README.md",
    "apps/site/src/pages/index.astro",
    "apps/web/AGENTS.md",
    "apps/web/acceptance/editor.spec.ts",
    "apps/worker/src/publishing.test.ts",
    "packages/astro/src/index.ts",
    "packages/cli/src/index.ts",
    "packages/create-prosewire/src/index.ts",
    "packages/mcp/src/index.ts",
    "packages/next/src/index.ts",
    "packages/sdk/src/index.ts",
  ]) {
    assert.equal(requiresEdgeImage([path]), false, path);
  }
});

test("a public-package lockfile update skips edge", () => {
  assert.equal(
    requiresEdgeImage(["packages/sdk/package.json", "pnpm-lock.yaml"]),
    false,
  );
});

test("a runtime lockfile update requires edge", () => {
  assert.equal(
    requiresEdgeImage(["apps/web/package.json", "pnpm-lock.yaml"]),
    true,
  );
  assert.equal(requiresEdgeImage(["pnpm-lock.yaml"]), true);
});

test("the push range includes multiple commits and deletions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prosewire-edge-range-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Image test"], {
      cwd: directory,
    });
    execFileSync("git", ["config", "user.email", "image@example.com"], {
      cwd: directory,
    });
    await writeFile(join(directory, "Dockerfile"), "FROM scratch\n");
    execFileSync("git", ["add", "Dockerfile"], { cwd: directory });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: directory,
    });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    await writeFile(join(directory, "README.md"), "docs\n");
    execFileSync("git", ["add", "README.md"], { cwd: directory });
    execFileSync("git", ["commit", "--quiet", "-m", "docs"], {
      cwd: directory,
    });
    execFileSync("git", ["rm", "--quiet", "Dockerfile"], { cwd: directory });
    execFileSync("git", ["commit", "--quiet", "-m", "remove image input"], {
      cwd: directory,
    });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    const previous = process.cwd();
    try {
      process.chdir(directory);
      const paths = changedPaths(baseSha, headSha);
      assert.deepEqual(paths?.sort(), ["Dockerfile", "README.md"]);
      assert.equal(requiresEdgeImage(paths ?? []), true);
    } finally {
      process.chdir(previous);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
