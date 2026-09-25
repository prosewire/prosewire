import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiMediaConflict,
  ApiMediaNotFound,
  ApiMediaTooLarge,
  ApiMediaUnavailable,
  ApiPostConflict,
  ApiPostNotFound,
  ApiRevisionNotFound,
  ApiUnavailable,
} from "@prosewire/contract";
import { type Effect, Predicate } from "effect";
import type { ApiAccess } from "./api-access.ts";
import type { ApiContent } from "./api-content.ts";
import type { Media } from "./media.ts";
import type { PostErrors } from "./post-errors.ts";
import type { PublishingRepository } from "./publishing-repository.ts";
export type ApiApplicationError =
  | ApiAccess.Error
  | PostErrors.Error
  | Effect.Error<ReturnType<ApiContent.Interface[keyof ApiContent.Interface]>>
  | Effect.Error<
      ReturnType<
        PublishingRepository.Interface[keyof PublishingRepository.Interface]
      >
    >
  | Effect.Error<ReturnType<Media.Interface[keyof Media.Interface]>>;

const constructors = {
  ApiAuthenticationFailed,
  ApiScopeDenied: ApiAccessDenied,
  ApiBlogDenied: ApiAccessDenied,
  ApiBlogReferenceDenied: ApiAccessDenied,
  BlogAccessDenied: ApiAccessDenied,
  PostNotFound: ApiPostNotFound,
  BlogNotFound: ApiPostNotFound,
  PostRevisionNotFound: ApiRevisionNotFound,
  PostConflict: ApiPostConflict,
  InvalidPost: ApiInputRejected,
  InvalidBlogSettings: ApiInputRejected,
  MediaInvalidUpload: ApiInputRejected,
  MediaInvalidImage: ApiInputRejected,
  MediaAssetNotFound: ApiMediaNotFound,
  MediaAssetInUse: ApiMediaConflict,
  MediaInvalidState: ApiMediaConflict,
  MediaUploadExpired: ApiMediaConflict,
  MediaQuotaExceeded: ApiMediaTooLarge,
  MediaStorageNotConfigured: ApiMediaUnavailable,
  MediaObjectStorageError: ApiMediaUnavailable,
  MediaImageProcessingError: ApiMediaUnavailable,
  ApiAccessPersistenceError: ApiUnavailable,
  ApiContentPersistenceError: ApiUnavailable,
  PublishingRepositoryPersistenceError: ApiUnavailable,
  BlogAccessPersistenceError: ApiUnavailable,
  MediaPersistenceError: ApiUnavailable,
  InvalidPostRevision: ApiUnavailable,
  PostRenderingFailed: ApiUnavailable,
} satisfies Record<
  ApiApplicationError["_tag"],
  new (input: {
    message: string;
  }) => Error
>;

export function toApiError(error: ApiApplicationError) {
  const Failure = constructors[error._tag];
  const message =
    Failure === ApiUnavailable
      ? "Unable to complete the request. Please try again."
      : Failure === ApiMediaUnavailable
        ? "Media storage is temporarily unavailable"
        : error.message;
  return new Failure({ message });
}

function diagnosticString(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function knownErrorTag(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return Object.hasOwn(constructors, value) || value === "DatabaseError"
    ? value
    : undefined;
}

/** Drizzle embeds query parameters in error messages and causes. Log metadata only. */
export function apiFailureDiagnostics(error: unknown) {
  const diagnostics = {
    tag: undefined as string | undefined,
    operation: undefined as string | undefined,
    code: undefined as string | undefined,
    constraint: undefined as string | undefined,
  };
  const seen = new Set<unknown>();
  while (Predicate.isObject(error) && !seen.has(error) && seen.size < 16) {
    seen.add(error);
    const tag = knownErrorTag(error["_tag"]);
    diagnostics.tag ??= tag;
    if (tag !== undefined) {
      diagnostics.operation ??= diagnosticString(
        error["operation"],
        /^[A-Za-z][A-Za-z0-9. _-]{0,79}$/,
      );
    }
    diagnostics.code ??= diagnosticString(
      error["code"],
      /^(?:[A-Z0-9]{5}|E[A-Z_]{2,30})$/,
    );
    diagnostics.constraint ??= diagnosticString(
      error["constraint"],
      /^[a-z][a-z0-9_]{0,62}$/,
    );
    error = error["cause"];
  }
  return { ...diagnostics, tag: diagnostics.tag ?? "UnknownError" };
}
