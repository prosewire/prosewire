import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.ts";

describe("self-hosted Next.js configuration", () => {
  it("reads the deployment ID at server runtime for prebuilt images", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.outputFileTracingIncludes?.["/*"]).toEqual([
      "../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
    ]);
    expect(nextConfig.experimental?.runtimeServerDeploymentId).toBe(true);
  });

  it("applies baseline browser security headers", async () => {
    const entries = await nextConfig.headers?.();
    const headers = new Map(
      entries?.[0]?.headers.map((header) => [header.key, header.value]),
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
