import { describe, expect, it } from "vitest";

import { POST } from "./route.ts";

describe("POST /api/events/view", () => {
  it("rejects malformed JSON without initializing the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/events/view", {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid event" });
  });
});
