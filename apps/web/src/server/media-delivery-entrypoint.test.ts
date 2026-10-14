import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaDelivery } from "./media-delivery.ts";
import { deliverMedia } from "./media-delivery-entrypoint.ts";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSessionWithHeadersEffect: mocks.session,
}));
vi.mock("./app-runtime.ts", () => ({
  runAppEffect: (
    effect: Effect.Effect<unknown, unknown, MediaDelivery.Service>,
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(MediaDelivery.Service, {
          resolve: mocks.resolve,
        }),
      ),
    ),
}));

describe("signed media transport", () => {
  const signedUrl = vi.fn((method: "GET" | "HEAD") =>
    Effect.succeed(`https://storage.example.com/${method}`),
  );
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockReturnValue(Effect.succeed({ signedUrl }));
    mocks.session.mockReturnValue(Effect.succeed({ user: { id: "reader" } }));
  });
  it.each(["GET", "HEAD"] as const)(
    "signs the correct %s request without loading public-reader sessions",
    async (method) => {
      const response = await deliverMedia(
        new Request("https://cloud.example.com/media/key", { method }),
        "key",
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://storage.example.com/${method}`,
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.session).not.toHaveBeenCalled();
      expect(signedUrl).toHaveBeenCalledWith(method);
    },
  );
  it("conceals unpublished media and allows an authorized member preview", async () => {
    mocks.resolve.mockImplementation(
      (_key: string, reader: Effect.Effect<string | null>) =>
        reader.pipe(
          Effect.map((userId) => (userId === "reader" ? { signedUrl } : null)),
        ),
    );
    expect(
      (
        await deliverMedia(
          new Request("https://cloud.example.com/media/key"),
          "key",
        )
      ).status,
    ).toBe(404);
    expect(signedUrl).not.toHaveBeenCalled();
    const preview = await deliverMedia(
      new Request("https://cloud.example.com/media/key", {
        headers: { cookie: "session=test" },
      }),
      "key",
    );
    expect(preview.status).toBe(302);
    expect(preview.headers.get("cache-control")).toBe("no-store");
  });
  it("reports backend failure without exposing a signed URL or internal cause", async () => {
    mocks.resolve.mockReturnValue(Effect.fail("private backend details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await deliverMedia(
        new Request("https://cloud.example.com/media/key"),
        "key",
      );
      expect(response.status).toBe(503);
      expect(response.headers.has("location")).toBe(false);
      expect(log).toHaveBeenCalledWith("Media delivery failed", {
        errorTag: "Unknown",
      });
    } finally {
      log.mockRestore();
    }
  });
});
