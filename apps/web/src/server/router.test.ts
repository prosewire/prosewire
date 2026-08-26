import { describe, expect, it } from "vitest";
import { handlePrivateApi } from "./router.ts";

async function errorFor(path: string, init?: RequestInit) {
  const response = await handlePrivateApi(
    new Request(`http://localhost${path}`, init),
  );
  return {
    status: response.status,
    body: (await response.json()) as { _tag: string; message: string },
  };
}

describe("private API transport validation", () => {
  it("rejects a page size above the contract maximum", async () => {
    const result = await errorFor("/api/v1/posts?pageSize=101");

    expect(result.status).toBe(400);
    expect(result.body._tag).toBe("ApiInputRejected");
  });

  it("rejects malformed JSON before invoking the application runtime", async () => {
    const result = await errorFor("/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      _tag: "ApiInputRejected",
      message: "Invalid JSON request body",
    });
  });

  it("maps malformed encoded identifiers to an input error", async () => {
    const result = await errorFor("/api/v1/posts/%E0%A4%A");

    expect(result.status).toBe(400);
    expect(result.body._tag).toBe("ApiInputRejected");
  });

  it("rejects malformed revision identifiers before the application runtime", async () => {
    const result = await errorFor(
      "/api/v1/posts/11111111-1111-4111-8111-111111111111/revisions/not-a-uuid/restore",
      { method: "POST" },
    );

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      _tag: "ApiInputRejected",
      message: "Invalid revision id",
    });
  });
});
