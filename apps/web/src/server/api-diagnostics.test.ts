import { DrizzleQueryError } from "drizzle-orm/errors";
import { Effect, Layer, Logger } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiContent } from "./api-content.ts";
import { apiFailureDiagnostics } from "./api-errors.ts";
import { Database, DatabaseError } from "./database.ts";
import { handlePrivateApi } from "./router.ts";

const runtime = vi.hoisted(() => ({ runAppEffect: vi.fn() }));
vi.mock("./app-runtime.ts", () => ({ runAppEffect: runtime.runAppEffect }));

const secret = "SYNTHETIC_PRIVATE_DRAFT_AND_CREDENTIAL";
function driverFailure() {
  return new DrizzleQueryError(
    "insert into private_content values ($1)",
    [secret],
    Object.assign(new Error(secret), {
      code: "23503",
      constraint: "post_author_blog_fk",
      detail: secret,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  runtime.runAppEffect.mockReset();
});

describe("private API failure diagnostics", () => {
  it("logs only metadata once for a nested persistence failure", async () => {
    const messages: unknown[] = [];
    const logger = Logger.make((options) => {
      messages.push(options.message);
    });
    const database = Layer.succeed(Database, {
      client: Effect.die("unused"),
      execute: (operation) =>
        Effect.fail(new DatabaseError({ operation, cause: driverFailure() })),
    });
    const services = ApiContent.layer.pipe(Layer.provide(database));
    runtime.runAppEffect.mockImplementation(
      <A, E>(effect: Effect.Effect<A, E, ApiContent.Service>) =>
        Effect.runPromise(
          effect.pipe(
            Effect.provide(Layer.merge(services, Logger.layer([logger]))),
          ),
        ),
    );
    const unexpectedLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const response = await handlePrivateApi(
      new Request("http://localhost/api/v1/health"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      _tag: "ApiUnavailable",
      message: "Unable to complete the request. Please try again.",
    });
    expect(messages).toEqual([
      [
        "Private API operation failed",
        {
          tag: "ApiContentPersistenceError",
          operation: "health.ready",
          code: "23503",
          constraint: "post_author_blog_fk",
        },
      ],
    ]);
    expect(JSON.stringify(messages)).not.toContain(secret);
    expect(JSON.stringify(messages)).not.toContain("insert into");
    expect(unexpectedLog).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected router failures too", async () => {
    runtime.runAppEffect.mockRejectedValue(driverFailure());
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handlePrivateApi(
      new Request("http://localhost/api/v1/health"),
    );
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Unhandled private API failure",
      {
        tag: "UnknownError",
        code: "23503",
        constraint: "post_author_blog_fk",
      },
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("ignores arbitrary error data and terminates cyclic cause chains", () => {
    const failure = {
      _tag: secret,
      operation: secret,
      code: "invalid code",
      constraint: "private value!",
      cause: undefined as unknown,
    };
    failure.cause = failure;
    expect(apiFailureDiagnostics(failure)).toEqual({ tag: "UnknownError" });
  });
});
