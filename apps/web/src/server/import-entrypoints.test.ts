import { access } from "node:fs/promises";
import { ApiImportConflict } from "@prosewire/contract";
import { Effect, Result, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ runAppEffect: vi.fn() }));
vi.mock("./app-runtime.ts", () => ({ runAppEffect: runtime.runAppEffect }));

import { ApiAccess } from "./api-access.ts";
import { ApiKeyId, BlogId } from "./domain.ts";
import { importPublication } from "./import-entrypoints.ts";
import { type ImportFiles, importRecords } from "./import-files.ts";
import { PortableImport } from "./portable-import.ts";

class ForeignFailure extends Schema.TaggedError<ForeignFailure>()(
  "ForeignFailure",
  { message: Schema.String },
) {}
const principal = new ApiAccess.Principal({
  blogId: BlogId.make("11111111-1111-4111-8111-111111111111"),
  keyId: ApiKeyId.make("22222222-2222-4222-8222-222222222222"),
  scopes: ["content:write"],
});
const document = {
  format: "prosewire-portable-export",
  version: 2,
  publication: { id: principal.blogId },
  authors: [],
  categories: [],
  posts: [{ id: "post", title: "Zoë 🐈" }],
  snippets: [],
  redirects: [],
  mediaAssets: [],
};
function request(bytes: string, query = "") {
  const input = new TextEncoder().encode(bytes);
  let offset = 0;
  return new Request(`https://prosewire.test/api/v1/import${query}`, {
    method: "POST",
    headers: {
      authorization: "Bearer pw_test",
      "content-type": "application/json",
    },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === input.length) controller.close();
        else controller.enqueue(input.subarray(offset, ++offset));
      },
    }),
    duplex: "half",
  } as RequestInit);
}
describe("streamed management import transport", () => {
  const authenticate = vi.fn<ApiAccess.Interface["authenticate"]>();
  const run = vi.fn<PortableImport.Interface["run"]>();
  beforeEach(() => {
    authenticate.mockReset().mockReturnValue(Effect.succeed(principal));
    run
      .mockReset()
      .mockImplementation((files, _principal, mode, preserveStates) =>
        Effect.succeed({
          mode,
          preserveStates,
          counts: files.counts,
          fingerprint: files.fingerprint,
          alreadyImported: false,
        }),
      );
    runtime.runAppEffect.mockImplementation((effect, signal) =>
      Effect.runPromise(
        effect.pipe(
          Effect.provideService(ApiAccess.Service, {
            authenticate,
            requireBlog: (actor) => Effect.succeed(actor),
          }),
          Effect.provideService(PortableImport.Service, { run }),
        ),
        { signal },
      ),
    );
  });
  it("authenticates before reading, forwards explicit policy, and removes spooled files", async () => {
    let captured: ImportFiles | undefined;
    run.mockImplementation((files, actor, mode, preserveStates) =>
      Effect.promise(async () => {
        captured = files;
        expect(actor).toEqual(principal);
        const posts = [];
        for await (const item of importRecords(files, "posts"))
          posts.push(item.value);
        expect(posts).toEqual(document.posts);
        return {
          mode,
          preserveStates,
          counts: files.counts,
          fingerprint: files.fingerprint,
          alreadyImported: false,
        };
      }),
    );
    const response = await importPublication(
      request(JSON.stringify(document), "?mode=apply&preserveStates=true"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "apply",
      preserveStates: true,
      counts: { posts: 1 },
    });
    expect(authenticate).toHaveBeenCalledWith("pw_test", "content:write");
    expect(captured).toBeDefined();
    if (!captured) throw new Error("Import did not run");
    await expect(access(captured.directory)).rejects.toThrow();
  });
  it.each([
    [new ApiAccess.AuthenticationFailed({ message: "Invalid key" }), 401],
    [new ApiAccess.ScopeDenied({ requiredScope: "content:write" }), 403],
  ] as const)(
    "rejects authentication/scope failure before malformed file work",
    async (failure, status) => {
      authenticate.mockReturnValue(Effect.fail(failure));
      expect((await importPublication(request("invalid JSON"))).status).toBe(
        status,
      );
      expect(run).not.toHaveBeenCalled();
    },
  );
  it("returns item-specific validation, collision, and safe infrastructure errors", async () => {
    const malformed = await importPublication(
      request(JSON.stringify(document).slice(0, -1)),
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      _tag: "ApiImportRejected",
      item: "export",
    });
    expect(run).not.toHaveBeenCalled();
    run.mockReturnValue(
      Effect.fail(
        new ApiImportConflict({ item: "posts[0]", message: "Existing slug" }),
      ),
    );
    const conflicting = await importPublication(
      request(JSON.stringify(document)),
    );
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toMatchObject({
      item: "posts[0]",
      message: "Existing slug",
    });
    run.mockReturnValue(
      Effect.fail({
        _tag: "ImportPersistenceError",
        cause: "private SQL",
      } as never),
    );
    const unavailable = await importPublication(
      request(JSON.stringify(document)),
    );
    expect(unavailable.status).toBe(500);
    expect(JSON.stringify(await unavailable.json())).not.toContain(
      "private SQL",
    );
  });
  it.each([
    ["ApiAuthenticationFailed", 401, undefined],
    ["ApiScopeDenied", 403, undefined],
    ["ApiImportRejected", 400, "posts[2]"],
    ["ApiImportConflict", 409, "posts[2]"],
  ] as const)(
    "maps a %s failure from another bundle to HTTP %s",
    async (tag, status, item) => {
      const foreign = Object.assign(
        new ForeignFailure({ message: "Boundary failure" }),
        { _tag: tag, ...(item === undefined ? {} : { item }) },
      );
      runtime.runAppEffect.mockResolvedValue(Result.fail(foreign));
      const response = await importPublication(
        request(JSON.stringify(document)),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        message: "Boundary failure",
        ...(item === undefined ? {} : { item }),
      });
    },
  );

  it("rejects ambiguous query policies without invoking the runtime", async () => {
    runtime.runAppEffect.mockClear();
    expect(
      (await importPublication(request("{}", "?mode=overwrite"))).status,
    ).toBe(400);
    expect(runtime.runAppEffect).not.toHaveBeenCalled();
  });
});
