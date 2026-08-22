import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyGitRange, classifyPaths } from "./ci-change-classifier.mjs";

test("a create-prosewire test stays in package quality", () => {
  assert.deepEqual(
    classifyPaths(["packages/create-prosewire/src/index.test.ts"]),
    {
      dependency_audit: false,
      edge_image: false,
      full_quality: false,
      integration: false,
      package_release: false,
      package_smoke: "create-prosewire",
    },
  );
});

test("dependency inputs run the audit and runtime validation", () => {
  const result = classifyPaths(["pnpm-lock.yaml"]);
  assert.equal(result.dependency_audit, true);
  assert.equal(result.integration, true);
  assert.equal(result.edge_image, true);
  assert.equal(result.package_smoke, "sdk,cli,mcp,next,astro,create-prosewire");
});

test("runtime paths run integration and image validation", () => {
  for (const path of [
    "apps/web/src/app/page.tsx",
    "apps/worker/src/index.ts",
    "packages/db/drizzle/0001.sql",
    "packages/core/src/index.ts",
    "Dockerfile",
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.integration, true, path);
    assert.equal(result.edge_image, true, path);
  }
});

test("runtime-only tests do not rebuild the edge image", () => {
  for (const path of [
    "apps/web/acceptance/editor.spec.ts",
    "apps/worker/src/publishing.test.ts",
    "packages/core/src/seo.test.ts",
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.integration, true, path);
    assert.equal(result.edge_image, false, path);
  }
});

test("SDK changes preserve downstream package and acceptance contracts", () => {
  const result = classifyPaths(["packages/sdk/src/index.ts"]);
  assert.equal(result.integration, true);
  assert.equal(result.edge_image, false);
  assert.equal(result.package_smoke, "sdk,cli,mcp,next,astro");
});

test("version-only public manifests avoid runtime work", () => {
  const path = "packages/sdk/package.json";
  const result = classifyPaths([path], {
    versionOnlyManifests: new Set([path]),
  });
  assert.equal(result.dependency_audit, true);
  assert.equal(result.integration, false);
  assert.equal(result.edge_image, false);
  assert.equal(result.package_release, true);
});

test("a Changesets version PR skips unrelated runtime validation", () => {
  const manifests = [
    "packages/sdk/package.json",
    "packages/cli/package.json",
    "packages/mcp/package.json",
    "packages/next/package.json",
    "packages/astro/package.json",
    "packages/create-prosewire/package.json",
  ];
  const result = classifyPaths(
    [
      ...manifests,
      ...manifests.map((path) => path.replace("package.json", "CHANGELOG.md")),
      "packages/cli/src/version.ts",
      "packages/mcp/src/version.ts",
      "packages/create-prosewire/src/version.ts",
    ],
    { versionOnlyManifests: new Set(manifests) },
  );
  assert.equal(result.dependency_audit, true);
  assert.equal(result.integration, false);
  assert.equal(result.edge_image, false);
  assert.equal(result.package_release, true);
  assert.equal(result.package_smoke, "sdk,cli,mcp,next,astro,create-prosewire");
});

test("workflow and classifier changes force full validation", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "scripts/ci-change-classifier.mjs",
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.dependency_audit, true, path);
    assert.equal(result.full_quality, true, path);
    assert.equal(result.integration, true, path);
    assert.equal(result.edge_image, true, path);
  }
});

test("manual runs are conservative", async () => {
  const result = await classifyGitRange({ eventName: "workflow_dispatch" });
  assert.equal(result.dependency_audit, true);
  assert.equal(result.full_quality, true);
  assert.equal(result.integration, true);
  assert.equal(result.edge_image, true);
});

test("the push range includes multi-commit changes and deletions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prosewire-ci-range-"));
  const previous = process.cwd();
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "CI test"], {
      cwd: directory,
    });
    execFileSync("git", ["config", "user.email", "ci@example.com"], {
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
    execFileSync("git", ["commit", "--quiet", "-m", "delete image input"], {
      cwd: directory,
    });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    process.chdir(directory);
    const result = await classifyGitRange({
      eventName: "push",
      baseSha,
      headSha,
    });
    assert.equal(result.integration, true);
    assert.equal(result.edge_image, true);
  } finally {
    process.chdir(previous);
    await rm(directory, { recursive: true, force: true });
  }
});
