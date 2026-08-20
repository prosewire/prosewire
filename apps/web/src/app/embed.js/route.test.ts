import { describe, expect, it } from "vitest";
import { GET } from "./route.ts";

describe("GET /embed.js", () => {
  it("derives the API origin from the browser-visible script URL", async () => {
    const response = GET(new Request("http://0.0.0.0:3000/embed.js"));
    const script = await response.text();

    expect(script).toContain("new URL(s.src,document.baseURI).origin");
    expect(script).not.toContain("fetch('http://0.0.0.0:3000");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
