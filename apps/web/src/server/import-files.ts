import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  mkdirSync,
  openSync,
  writeSync,
} from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ApiImportRejected } from "@prosewire/contract";
import { JSONParser, TokenType } from "@streamparser/json";
import { Schema } from "effect";
import { Unzip, UnzipInflate } from "fflate";

export const importCollections = [
  "authors",
  "categories",
  "snippets",
  "redirects",
  "mediaAssets",
  "posts",
] as const;
export type ImportCollection = (typeof importCollections)[number];
const metadataLimit = 64 * 1_024 * 1_024;
const archiveLimit = 300 * 1_024 * 1_024;
const itemLimit = 8 * 1_024 * 1_024;
const reject = (item: string, message: string) =>
  new ApiImportRejected({ item, message });
const mediaManifest = Schema.Struct({
  format: Schema.Literal("prosewire-media-export"),
  version: Schema.Literal(1),
  publication: Schema.Struct({ id: Schema.String }),
  assets: Schema.Array(
    Schema.Struct({ id: Schema.String, sourcePath: Schema.String }),
  ),
});

interface ParserState {
  bytes: number;
  sinceValue: number;
  entries: number;
  depth: number;
  previous: TokenType;
  field: string;
  expectFieldValue: boolean;
}
function rootToken(
  state: ParserState,
  fields: Set<string>,
  token: TokenType,
  value: unknown,
) {
  if (
    token === TokenType.STRING &&
    [TokenType.LEFT_BRACE, TokenType.COMMA].includes(state.previous)
  ) {
    state.field = String(value);
    if (fields.has(state.field))
      throw reject(state.field, "Duplicate top-level field");
    if (
      ![
        "format",
        "version",
        "exportedAt",
        "publication",
        ...importCollections,
      ].includes(state.field)
    )
      throw reject(state.field, "Unknown export field");
    fields.add(state.field);
  } else if (state.expectFieldValue) {
    state.expectFieldValue = false;
    if (
      importCollections.includes(state.field as ImportCollection) &&
      token !== TokenType.LEFT_BRACKET
    )
      throw reject(state.field, "Expected an array");
  }
  if (token === TokenType.COLON) state.expectFieldValue = true;
}
async function feedJson(
  source: AsyncIterable<Uint8Array>,
  parser: JSONParser,
  hash: ReturnType<typeof createHash>,
  state: ParserState,
) {
  for await (const input of source) {
    for (let offset = 0; offset < input.byteLength; offset += 64 * 1_024) {
      const chunk = input.subarray(offset, offset + 64 * 1_024);
      state.bytes += chunk.byteLength;
      state.sinceValue += chunk.byteLength;
      if (state.bytes > metadataLimit)
        throw reject("export", "JSON export exceeds 64 MB");
      if (state.sinceValue > itemLimit + 64 * 1_024)
        throw reject(state.field, "Record exceeds 8 MB");
      hash.update(chunk);
      parser.write(chunk);
    }
  }
  if (!parser.isEnded) parser.end();
}
function requireExportHeader(
  fields: ReadonlySet<string>,
  header: Record<string, unknown>,
) {
  for (const required of [
    "format",
    "version",
    "publication",
    ...importCollections,
  ]) {
    if (!fields.has(required))
      throw reject(required, "Required export field is missing");
  }
  if (
    header["format"] !== "prosewire-portable-export" ||
    header["version"] !== 2
  )
    throw reject(
      "export",
      "Only Prosewire portable export version 2 is supported",
    );
}

/** One bounded parser value is retained; collection records live on disk. */
async function spoolJson(source: AsyncIterable<Uint8Array>, directory: string) {
  const files = new Map(
    importCollections.map((name) => [
      name,
      openSync(join(directory, `${name}.ndjson`), "wx"),
    ]),
  );
  const header: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const hash = createHash("sha256");
  const state = {
    bytes: 0,
    sinceValue: 0,
    entries: 0,
    depth: 0,
    previous: TokenType.LEFT_BRACE,
    field: "",
    expectFieldValue: false,
  };
  const fields = new Set<string>();
  const parser = new JSONParser({
    paths: [
      "$.format",
      "$.version",
      "$.publication",
      "$.exportedAt",
      ...importCollections.map((name) => `$.${name}.*`),
    ],
    keepStack: false,
    stringBufferSize: 64 * 1_024,
  });
  parser.onToken = ({ token, value }) => {
    if (state.depth === 1) rootToken(state, fields, token, value);
    if ([TokenType.LEFT_BRACE, TokenType.LEFT_BRACKET].includes(token))
      state.depth++;
    if ([TokenType.RIGHT_BRACE, TokenType.RIGHT_BRACKET].includes(token))
      state.depth--;
    if (state.depth > 64)
      throw reject(state.field, "Export nesting exceeds 64 levels");
    state.previous = token;
  };
  parser.onValue = ({ value, key, stack }) => {
    state.sinceValue = 0;
    if (stack.length === 1 && typeof key === "string") {
      header[key] = value;
      return;
    }
    const name = stack[1]?.key as ImportCollection;
    const file = files.get(name);
    if (file === undefined)
      throw reject("export", "Unexpected export structure");
    if (++state.entries > 10_000)
      throw reject(name, "Import exceeds 10,000 collection records");
    counts[name] = (counts[name] ?? 0) + 1;
    const record = `${JSON.stringify(value)}\n`;
    if (Buffer.byteLength(record) > itemLimit)
      throw reject(`${name}[${key}]`, "Record exceeds 8 MB");
    writeSync(file, record);
  };
  try {
    await feedJson(source, parser, hash, state);
    requireExportHeader(fields, header);
    return { header, counts, fingerprint: hash.digest("hex") };
  } catch (error) {
    if (error instanceof ApiImportRejected) throw error;
    throw reject("export", "Malformed or incomplete JSON export");
  } finally {
    for (const file of files.values()) closeSync(file);
  }
}

/** Never trust ZIP paths, size declarations, or compression ratios. */
async function unpack(
  source: AsyncIterable<Uint8Array>,
  directory: string,
  allowEnvelope: boolean,
) {
  const handles = new Set<number>();
  const names = new Set<string>();
  const pending = new Set<string>();
  let inputBytes = 0;
  let outputBytes = 0;
  const zip = new Unzip((entry) => {
    const name = entry.name;
    if (
      !(
        /^(?:manifest\.json|assets\/[0-9a-f-]{36}\/original\.(?:jpg|jpeg|png|webp|avif|bin))$/.test(
          name,
        ) ||
        (allowEnvelope && ["export.json", "media.zip"].includes(name))
      )
    )
      throw reject(name, "Unexpected ZIP entry or unsafe path");
    if (names.has(name) || names.size >= 10_002)
      throw reject(name, "Duplicate entry or too many ZIP files");
    names.add(name);
    pending.add(name);
    mkdirSync(join(directory, name, ".."), { recursive: true });
    const file = openSync(join(directory, name), "wx");
    handles.add(file);
    let bytes = 0;
    const limit =
      name === "media.zip"
        ? archiveLimit
        : name === "export.json"
          ? metadataLimit
          : name === "manifest.json"
            ? itemLimit
            : 20 * 1_024 * 1_024;
    entry.ondata = (error, chunk, final) => {
      if (error) throw reject(name, "Corrupt ZIP entry");
      bytes += chunk.byteLength;
      outputBytes += chunk.byteLength;
      if (bytes > limit || outputBytes > archiveLimit)
        throw reject(name, "ZIP expansion exceeds import limits");
      writeSync(file, chunk);
      if (final) {
        closeSync(file);
        handles.delete(file);
        pending.delete(name);
      }
    };
    entry.start();
  });
  zip.register(UnzipInflate);
  try {
    for await (const input of source) {
      inputBytes += input.byteLength;
      if (inputBytes > archiveLimit)
        throw reject("archive", "Archive exceeds 300 MB");
      for (let offset = 0; offset < input.byteLength; offset += 4 * 1_024)
        zip.push(input.subarray(offset, offset + 4 * 1_024), false);
    }
    zip.push(new Uint8Array(), true);
    if (pending.size > 0) throw reject("archive", "Incomplete ZIP archive");
    return names;
  } catch (error) {
    if (error instanceof ApiImportRejected) throw error;
    throw reject("archive", "Malformed ZIP archive");
  } finally {
    for (const file of handles) closeSync(file);
  }
}

export interface ImportFiles {
  readonly directory: string;
  readonly header: Record<string, unknown>;
  readonly counts: Record<string, number>;
  readonly fingerprint: string;
  readonly mediaPaths: ReadonlySet<string>;
  readonly dispose: () => Promise<void>;
}

async function extractMedia(directory: string, names: ReadonlySet<string>) {
  if (!names.has("media.zip")) {
    const mediaPaths = new Set(
      [...names].filter((name) => name.startsWith("assets/")),
    );
    if (mediaPaths.size && !names.has("manifest.json"))
      throw reject(
        "manifest.json",
        "Media archive is missing its versioned manifest",
      );
    return {
      mediaPaths,
      manifestPath: mediaPaths.size ? "manifest.json" : undefined,
    };
  }
  if ([...names].some((name) => name.startsWith("assets/")))
    throw reject("archive", "Use either media.zip or flattened media assets");
  const mediaDirectory = join(directory, "media");
  mkdirSync(mediaDirectory);
  const mediaNames = await unpack(
    createReadStream(join(directory, "media.zip")),
    mediaDirectory,
    false,
  );
  if (!mediaNames.has("manifest.json"))
    throw reject(
      "manifest.json",
      "Media ZIP is missing its versioned manifest",
    );
  return {
    mediaPaths: new Set(
      [...mediaNames]
        .filter((name) => name.startsWith("assets/"))
        .map((name) => `media/${name}`),
    ),
    manifestPath: "media/manifest.json",
  };
}
async function importSource(
  body: ReadableStream<Uint8Array>,
  contentType: string,
  directory: string,
) {
  if (contentType === "application/json")
    return {
      source: body as AsyncIterable<Uint8Array>,
      mediaPaths: new Set<string>(),
      manifestPath: undefined,
    };
  if (contentType !== "application/zip")
    throw reject("request", "Use application/json or application/zip");
  const names = await unpack(body, directory, true);
  if (!names.has("export.json"))
    throw reject("export.json", "Archive must contain export.json");
  return {
    source: createReadStream(join(directory, "export.json")),
    ...(await extractMedia(directory, names)),
  };
}
async function validateMediaManifest(
  directory: string,
  manifestPath: string,
  mediaPaths: ReadonlySet<string>,
  header: Record<string, unknown>,
) {
  try {
    const manifest = Schema.decodeUnknownSync(mediaManifest)(
      JSON.parse(await readFile(join(directory, manifestPath), "utf8")),
    );
    const publication = Schema.decodeUnknownSync(
      Schema.Struct({ id: Schema.String }),
    )(header["publication"]);
    const prefix = manifestPath.startsWith("media/") ? "media/" : "";
    const paths = new Set(
      manifest.assets.map((asset) => `${prefix}${asset.sourcePath}`),
    );
    if (
      manifest.publication.id !== publication.id ||
      paths.size !== manifest.assets.length ||
      paths.size !== mediaPaths.size ||
      [...paths].some((path) => !mediaPaths.has(path))
    )
      throw reject(
        "manifest.json",
        "Media manifest does not match the source publication and original files",
      );
  } catch (error) {
    if (error instanceof ApiImportRejected) throw error;
    throw reject(
      "manifest.json",
      "Invalid Prosewire media manifest; version 1 is required",
    );
  }
}
export async function receiveImport(
  body: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<ImportFiles> {
  const directory = await mkdtemp(join(tmpdir(), "prosewire-import-"));
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    const { source, mediaPaths, manifestPath } = await importSource(
      body,
      contentType,
      directory,
    );
    const parsed = await spoolJson(source, directory);
    if (manifestPath)
      await validateMediaManifest(
        directory,
        manifestPath,
        mediaPaths,
        parsed.header,
      );
    return { ...parsed, directory, mediaPaths, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function* importRecords(
  files: ImportFiles,
  collection: ImportCollection,
) {
  const input = createReadStream(join(files.directory, `${collection}.ndjson`));
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  });
  let index = 0;
  try {
    for await (const line of lines)
      yield {
        item: `${collection}[${index++}]`,
        value: JSON.parse(line) as unknown,
      };
  } finally {
    lines.close();
    input.destroy();
  }
}
