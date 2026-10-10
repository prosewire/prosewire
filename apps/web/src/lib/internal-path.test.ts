import { describe, expect, it } from "vitest";
import { internalPath } from "./internal-path.ts";

describe("internal navigation destinations", () => {
  it.each([
    undefined,
    "",
    "https://external.invalid/",
    "//external.invalid/",
    "/\\external.invalid/",
    "/\n/external.invalid/",
    "/\t/external.invalid/",
    "/posts\r/new",
    "/posts\u0000/new",
  ])("falls back for unsafe destination %j", (value) => {
    expect(internalPath(value)).toBe("/dashboard");
    expect(internalPath(value, "/onboarding")).toBe("/onboarding");
  });

  it.each([
    "/posts/new",
    "/dashboard?saved=1#recent",
    "/accept-invitation/invitation-id",
    "/.//external.invalid",
    "/posts/..//external.invalid",
  ])("keeps a safe local destination %j on the same origin", (value) => {
    const destination = internalPath(value);
    expect(destination).toBe(value);
    expect(new URL(destination, "https://operator.example").origin).toBe(
      "https://operator.example",
    );
  });
});
