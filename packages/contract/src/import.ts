import { Schema } from "effect";

/** Imports use a streaming body rather than the buffered JSON HttpApi adapter. */
export const portableImportPath = "/api/v1/import";
export const portableImportReport = Schema.Struct({
  mode: Schema.Literals(["preview", "apply"]),
  fingerprint: Schema.String,
  preserveStates: Schema.Boolean,
  counts: Schema.Record(Schema.String, Schema.Int),
  alreadyImported: Schema.Boolean,
});
export type PortableImportReport = typeof portableImportReport.Type;

export class ApiImportRejected extends Schema.TaggedError<ApiImportRejected>()(
  "ApiImportRejected",
  { item: Schema.String, message: Schema.String },
  { httpApiStatus: 400 },
) {}
export class ApiImportConflict extends Schema.TaggedError<ApiImportConflict>()(
  "ApiImportConflict",
  { item: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}
