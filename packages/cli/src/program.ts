import { readFile } from "node:fs/promises";
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
  readonly posts: Pick<Client["posts"], "create" | "update" | "archive">;
}

interface CliDependencies {
  readonly readFile: typeof readFile;
  readonly createClient: (options: ProsewireClientOptions) => CliPrivateClient;
  readonly createPublicClient: typeof createPublicClient;
  readonly output: (value: unknown) => void;
  readonly env: NodeJS.ProcessEnv;
}

const defaults: CliDependencies = {
  readFile,
  createClient,
  createPublicClient,
  output: (value) =>
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
  env: process.env,
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

  return root.pipe(
    Command.withSubcommands([posts, get, create, update, archive]),
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
