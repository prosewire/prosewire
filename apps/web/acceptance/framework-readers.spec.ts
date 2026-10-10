import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("fresh scaffolded Next.js and Astro consumers preserve public visibility", async ({
  baseURL,
}) => {
  test.setTimeout(15 * 60_000);
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  const proof = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts/package-tarball-smoke.mjs"),
      "--readers",
      "--packages=next,astro,create-prosewire",
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, PROSEWIRE_ONBOARDING_URL: baseURL },
      encoding: "utf8",
      timeout: 14 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  expect(
    proof.status,
    `${proof.error?.message ?? ""}\n${proof.stdout}\n${proof.stderr}`,
  ).toBe(0);
});
