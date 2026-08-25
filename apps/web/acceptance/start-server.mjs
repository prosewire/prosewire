import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const standaloneRoot = path.join(webRoot, ".next/standalone");
const standaloneNext = path.join(standaloneRoot, "apps/web/.next");

mkdirSync(standaloneNext, { recursive: true });
cpSync(
  path.join(webRoot, ".next/static"),
  path.join(standaloneNext, "static"),
  {
    recursive: true,
    force: true,
  },
);

process.chdir(standaloneRoot);
await import(
  pathToFileURL(path.join(standaloneRoot, "apps/web/server.js")).href
);
