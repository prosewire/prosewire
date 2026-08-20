import { describe, expect, it } from "vitest";

import { GET } from "./route.ts";

describe("GET /api/v1/health", () => {
  it("reports unavailable when required database configuration is missing", async () => {
    const response = await GET(new Request("http://localhost/api/v1/health"));

    expect(response.status).toBe(500);
  });
});
