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
import type { Effect } from "effect";
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
