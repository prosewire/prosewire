import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { postCreateInput, postUpdateInput } from "@prosewire/contract";
import {
  type Client,
  createClient,
  createPublicClient,
  type ProsewireClientOptions,
} from "@prosewire/sdk";
import { Effect, Option, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";
import { nodeServicesLayer } from "./node-services.ts";
import { version } from "./version.ts";

export interface CliPrivateClient {
  readonly blogs: Client["blogs"];
  readonly posts: Pick<
    Client["posts"],
    "create" | "update" | "archive" | "revisions" | "restore"
  >;
  readonly media: Client["media"];
}

interface CliDependencies {
  readonly readFile: typeof readFile;
  readonly createClient: (options: ProsewireClientOptions) => CliPrivateClient;
  readonly createPublicClient: typeof createPublicClient;
  readonly output: (value: unknown) => void;
  readonly env: NodeJS.ProcessEnv;
  readonly fetch: typeof fetch;
}

const defaults: CliDependencies = {
  readFile,
  createClient,
  createPublicClient,
  output: (value) =>
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
  env: process.env,
  fetch: globalThis.fetch,
};

const userError = (message: string) =>
  new CliError.UserError({ cause: new Error(message) });

function fromPromise<A>(evaluate: () => Promise<A>) {
  return Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new CliError.UserError({ cause }),
  });
}

function parseJson<S extends Schema.Constraint>(schema: S, value: string) {
  return Schema.decodeEffect(Schema.fromJsonString(schema))(value).pipe(
    Effect.mapError((cause) => new CliError.UserError({ cause })),
  );
}

export function createProgram(overrides: Partial<CliDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  const root = Command.make("prosewire").pipe(
    Command.withSharedFlags({
      url: Flag.string("url").pipe(
        Flag.withDescription("Prosewire URL"),
        Flag.withDefault(
          dependencies.env["PROSEWIRE_API_URL"] ?? "http://localhost:3000",
        ),
      ),
      key: Flag.string("key").pipe(
        Flag.withDescription("Private API key"),
        Flag.optional,
      ),
    }),
    Command.withDescription(
      "Publish and retrieve portable content from Prosewire",
    ),
  );

  const publication = Flag.string("blog").pipe(
    Flag.withDescription("Publication slug"),
    Flag.optional,
  );

  const posts = Command.make(
    "posts",
    {
      blog: publication,
      search: Flag.string("search").pipe(
        Flag.withDescription("Search published content"),
        Flag.optional,
      ),
    },
    Effect.fn("Cli.posts")(function* ({ blog, search }) {
      const parent = yield* root;
      const selectedBlog =
        Option.getOrUndefined(blog) ?? dependencies.env["PROSEWIRE_BLOG"];
      if (!selectedBlog) {
        return yield* userError("--blog or PROSEWIRE_BLOG is required");
      }
      const client = dependencies.createPublicClient({
        baseUrl: parent.url,
        blog: selectedBlog,
      });
      const query = Option.match(search, {
        onNone: () => ({}),
        onSome: (value) => ({ search: value }),
      });
      const result = yield* fromPromise(() => client.listPosts(query));
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("List posts"));

  const get = Command.make(
    "get",
    {
      slug: Argument.string("slug"),
      blog: publication,
    },
    Effect.fn("Cli.get")(function* ({ blog, slug }) {
      const parent = yield* root;
      const selectedBlog =
        Option.getOrUndefined(blog) ?? dependencies.env["PROSEWIRE_BLOG"];
      if (!selectedBlog) {
        return yield* userError("--blog or PROSEWIRE_BLOG is required");
      }
      const client = dependencies.createPublicClient({
        baseUrl: parent.url,
        blog: selectedBlog,
      });
      const result = yield* fromPromise(() => client.getPost(slug));
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Get one published post"));

  const dataFile = Flag.string("data").pipe(
    Flag.withDescription("Path to JSON request body"),
  );

  const create = Command.make(
    "create",
    { data: dataFile },
    Effect.fn("Cli.create")(function* ({ data }) {
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const source = yield* fromPromise(() =>
        dependencies.readFile(data, "utf8"),
      );
      const body = yield* parseJson(postCreateInput, source);
      const client = dependencies.createClient({
        baseUrl: parent.url,
        apiKey: key,
      });
      const result = yield* fromPromise(() => client.posts.create(body));
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Create a post from a JSON file"));

  const update = Command.make(
    "update",
    { id: Argument.string("id"), data: dataFile },
    Effect.fn("Cli.update")(function* ({ data, id }) {
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const source = yield* fromPromise(() =>
        dependencies.readFile(data, "utf8"),
      );
      const body = yield* parseJson(postUpdateInput, source);
      const client = dependencies.createClient({
        baseUrl: parent.url,
        apiKey: key,
      });
      const result = yield* fromPromise(() =>
        client.posts.update({
          params: { id },
          body,
        }),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Update a post from a JSON file"));

  const archive = Command.make(
    "archive",
    {
      id: Argument.string("id"),
      yes: Flag.boolean("yes").pipe(
        Flag.withDescription("Confirm the archive operation"),
      ),
    },
    Effect.fn("Cli.archive")(function* ({ id, yes }) {
      if (!yes) {
        return yield* userError("--yes is required to archive a post");
      }
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const result = yield* fromPromise(() =>
        dependencies
          .createClient({ baseUrl: parent.url, apiKey: key })
          .posts.archive({ params: { id } }),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Archive a post"));

  const revisions = Command.make(
    "revisions",
    { id: Argument.string("id") },
    Effect.fn("Cli.revisions")(function* ({ id }) {
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const result = yield* fromPromise(() =>
        dependencies
          .createClient({ baseUrl: parent.url, apiKey: key })
          .posts.revisions({ params: { id } }),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("List a post's revision history"));

  const restore = Command.make(
    "restore",
    {
      id: Argument.string("id"),
      revisionId: Argument.string("revision-id"),
      yes: Flag.boolean("yes").pipe(
        Flag.withDescription("Confirm the restore operation"),
      ),
    },
    Effect.fn("Cli.restore")(function* ({ id, revisionId, yes }) {
      if (!yes) {
        return yield* userError("--yes is required to restore a revision");
      }
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const result = yield* fromPromise(() =>
        dependencies
          .createClient({ baseUrl: parent.url, apiKey: key })
          .posts.restore({ params: { id, revisionId } }),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Restore a post revision"));

  const mediaList = Command.make(
    "media-list",
    {},
    Effect.fn("Cli.mediaList")(function* () {
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const result = yield* fromPromise(() =>
        dependencies
          .createClient({ baseUrl: parent.url, apiKey: key })
          .media.list(),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("List media assets and quota usage"));

  const uploadMimeTypes: Readonly<Record<string, string>> = {
    ".avif": "image/avif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  const mediaUpload = Command.make(
    "media-upload",
    {
      file: Argument.string("file"),
      blogId: Flag.string("blog-id").pipe(
        Flag.withDescription("Publication UUID"),
      ),
    },
    Effect.fn("Cli.mediaUpload")(function* ({ blogId, file }) {
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const mimeType = uploadMimeTypes[extname(file).toLowerCase()];
      if (!mimeType) {
        return yield* userError("Upload a JPEG, PNG, WebP, or AVIF image");
      }
      const body = yield* fromPromise(() => dependencies.readFile(file));
      const client = dependencies.createClient({
        baseUrl: parent.url,
        apiKey: key,
      });
      const reservation = yield* fromPromise(() =>
        client.media.startUpload({
          blogId,
          filename: basename(file),
          mimeType,
          byteSize: body.byteLength,
        }),
      );
      yield* fromPromise(async () => {
        const response = await dependencies.fetch(reservation.upload.url, {
          method: reservation.upload.method,
          headers: reservation.upload.headers,
          body,
        });
        if (!response.ok) {
          throw new Error(
            `Object storage rejected the upload (${String(response.status)})`,
          );
        }
      });
      const asset = yield* fromPromise(() =>
        client.media.completeUpload({
          params: { id: reservation.asset.id },
        }),
      );
      yield* Effect.sync(() => dependencies.output(asset));
    }),
  ).pipe(Command.withDescription("Upload and process a media asset"));

  const mediaDelete = Command.make(
    "media-delete",
    {
      id: Argument.string("id"),
      yes: Flag.boolean("yes").pipe(
        Flag.withDescription("Confirm permanent media deletion"),
      ),
    },
    Effect.fn("Cli.mediaDelete")(function* ({ id, yes }) {
      if (!yes) {
        return yield* userError("--yes is required to delete a media asset");
      }
      const parent = yield* root;
      const key =
        Option.getOrUndefined(parent.key) ??
        dependencies.env["PROSEWIRE_API_KEY"];
      if (!key) {
        return yield* userError("--key or PROSEWIRE_API_KEY is required");
      }
      const result = yield* fromPromise(() =>
        dependencies
          .createClient({ baseUrl: parent.url, apiKey: key })
          .media.delete({ params: { id } }),
      );
      yield* Effect.sync(() => dependencies.output(result));
    }),
  ).pipe(Command.withDescription("Delete an unreferenced media asset"));

  return root.pipe(
    Command.withSubcommands([
      posts,
      get,
      create,
      update,
      archive,
      revisions,
      restore,
      mediaList,
      mediaUpload,
      mediaDelete,
    ]),
  );
}

export function programEffect(
  args: ReadonlyArray<string>,
  overrides: Partial<CliDependencies> = {},
) {
  const normalized =
    args[0] === "node" || args[0]?.endsWith("/node") ? args.slice(2) : args;
  return Command.runWith(createProgram(overrides), {
    version,
    renderErrors: false,
  })(normalized).pipe(Effect.provide(nodeServicesLayer));
}

export function runProgram(
  args: ReadonlyArray<string>,
  overrides: Partial<CliDependencies> = {},
): Promise<void> {
  return Effect.runPromise(programEffect(args, overrides));
}
