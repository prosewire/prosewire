import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.ts";

describe("self-hosted Next.js configuration", () => {
  it("reads the deployment ID at server runtime for prebuilt images", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.experimental?.runtimeServerDeploymentId).toBe(true);
  });
});
