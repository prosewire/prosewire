import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(directory: string): ReadonlyArray<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && /\.[jt]sx$/.test(entry.name) ? [path] : [];
  });
}

describe("dashboard select controls", () => {
  it("uses the shared custom control instead of visible native selects", () => {
    const nativeSelectPattern = new RegExp(`<${"select"}\\b`);
    const offenders = tsxFiles(join(process.cwd(), "src")).filter((path) =>
      nativeSelectPattern.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
