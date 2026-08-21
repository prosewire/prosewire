import { spawnSync } from "node:child_process";

const forbiddenOrigin = ["https://prosewire-site", "akntech", "workers", "dev"].join(".");
const scan = spawnSync("git", ["grep", "-l", "--fixed-strings", forbiddenOrigin, "--"], {
  encoding: "utf8",
});
if (scan.status !== 0 && scan.status !== 1) {
  throw new Error(scan.stderr || "Unable to scan tracked files for dead origins");
}
const matches = scan.stdout.trim();

if (matches) {
  process.stderr.write(`Dead production origin found in:\n${matches}\n`);
  process.exit(1);
}

if (process.argv.includes("--production")) {
  if (!process.env.SITE_URL) {
    throw new Error("SITE_URL is required for a production documentation build");
  }
  const site = new URL(process.env.SITE_URL);
  const placeholderHost =
    site.hostname === "localhost" ||
    site.hostname.endsWith(".localhost") ||
    site.hostname.endsWith(".example") ||
    site.hostname.endsWith(".invalid") ||
    site.hostname.endsWith(".test");
  if (site.protocol !== "https:" || placeholderHost) {
    throw new Error("Production SITE_URL must be a verified public HTTPS origin");
  }
}

process.stdout.write("Site origin check passed.\n");
