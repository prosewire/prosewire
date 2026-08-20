import { describe, expect, it } from "vitest";
import { loadEditPost } from "./page-entrypoints.ts";

describe("dashboard page boundaries", () => {
  it("treats an invalid route identifier as a missing post", async () => {
    await expect(loadEditPost("not-a-uuid")).resolves.toEqual({
      _tag: "Success",
      value: null,
    });
  });
});
