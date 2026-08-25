import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const [reference, revision, source, ...platforms] = process.argv.slice(2);
assert.ok(reference, "image reference is required");
assert.ok(revision, "expected OCI revision is required");
assert.ok(source, "expected OCI source is required");
assert.ok(platforms.length > 0, "at least one platform is required");

function inspect(format) {
  const result = spawnSync(
    "docker",
    ["buildx", "imagetools", "inspect", reference, "--format", format],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const manifest = inspect("{{json .Manifest}}");
const images = inspect("{{json .Image}}");
const imagesByPlatform =
  images.os && images.architecture
    ? { [`${images.os}/${images.architecture}`]: images }
    : images;
const expectedDigest = reference.includes("@")
  ? reference.split("@").at(-1)
  : undefined;
if (expectedDigest) assert.equal(manifest.digest, expectedDigest);

for (const platform of platforms) {
  const image = imagesByPlatform[platform];
  assert.ok(image, `${reference} has no ${platform} image`);
  assert.equal(`${image.os}/${image.architecture}`, platform);
  const labels = image.config?.Labels ?? image.config?.labels ?? {};
  assert.equal(
    labels["org.opencontainers.image.revision"],
    revision,
    `${platform} OCI revision is incorrect`,
  );
  assert.equal(
    labels["org.opencontainers.image.source"],
    source,
    `${platform} OCI source is incorrect`,
  );
}

process.stdout.write(
  `Verified ${reference} (${platforms.join(", ")}) with revision and source labels.\n`,
);
