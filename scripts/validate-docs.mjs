import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "apps", "site", "dist");
const expectedOrigin = new URL(
  process.argv[2] ??
    process.env.SITE_URL ??
    (process.env.WORKERS_CI === "1"
      ? "https://prosewire.com"
      : "http://localhost:4321"),
);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const htmlFiles = (await walk(dist)).filter((file) => file.endsWith(".html"));
assert.ok(htmlFiles.length > 0, "documentation build produced no HTML files");

const requiredLegalPages = [
  "acceptable-use",
  "copyright",
  "data-location",
  "data-requests",
  "deletion-retention",
  "dpa",
  "privacy",
  "security",
  "subprocessors",
  "terms",
];
for (const slug of requiredLegalPages) {
  assert.ok(
    await exists(join(dist, "legal", slug, "index.html")),
    `legal page /legal/${slug}/ was not built`,
  );
}

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href || href.startsWith("#") || /^(?:https?:|mailto:|tel:)/.test(href))
      continue;
    const pathname = new URL(href, expectedOrigin).pathname;
    const target = pathname.endsWith("/")
      ? join(dist, pathname, "index.html")
      : join(dist, pathname);
    assert.ok(
      await exists(target),
      `${file}: internal link ${href} has no built target`,
    );
  }
}

const index = await readFile(join(dist, "index.html"), "utf8");
assert.match(index, /href="\/legal\/"/);
assert.match(index, /href="\/legal\/privacy\/"/);
assert.match(index, /href="\/legal\/security\/"/);
assert.match(
  index,
  new RegExp(`rel="canonical" href="${expectedOrigin.origin}/"`),
);
const robots = await readFile(join(dist, "robots.txt"), "utf8");
assert.equal(
  robots,
  `User-agent: *\nAllow: /\nSitemap: ${expectedOrigin.origin}/sitemap-index.xml\n`,
);
const sitemap = await readFile(join(dist, "sitemap-index.xml"), "utf8");
assert.match(sitemap, new RegExp(expectedOrigin.origin.replaceAll(".", "\\.")));
assert.doesNotMatch(
  `${index}\n${robots}\n${sitemap}`,
  /prosewire-site\.akntech\.workers\.dev/,
);

process.stdout.write(
  `Validated ${htmlFiles.length} documentation pages and internal links.\n`,
);
