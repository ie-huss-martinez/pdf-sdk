import { createErrorHelpers } from "@hussmartinez/sdk-core";
import { PdfError } from "./pdf-error.js";

/**
 * The family's error helpers, bound to `PdfError` (sdk-core ADR 0034), so
 * every port and the session make failures `PdfError`s the same way.
 */
const helpers = /* @__PURE__ */ createErrorHelpers(PdfError, {
  fallbackCode: "PROCESSING_FAILED",
  fallbackMessage: "PDF processing failed.",
});

/**
 * Makes any failure a `PdfError`, as every port promises: a `PdfError` as
 * it is, another `SdkError`, such as the worker client's own `ABORTED` or
 * `WORKER_CRASHED`, with its code, details and message kept, and anything
 * else as `PROCESSING_FAILED`. The original is kept as `cause`.
 *
 * @internal
 */
export const asPdfError: (reason: unknown, message?: string) => PdfError = helpers.adapt;

/**
 * The error an aborted call rejects with, as the family's worker client does
 * (ADR 0018, ADR 0020): the reason itself when it's an `SdkError`, such as a
 * file policy's `PROCESSING_TIME_EXCEEDED`, `TIMEOUT` for a timeout, and
 * `ABORTED` otherwise. The reason is kept as `cause`.
 *
 * @internal
 */
export const abortError: (signal: AbortSignal) => PdfError = helpers.abortError;

/**
 * Throws {@link abortError} if the signal has been aborted.
 *
 * @internal
 */
export const throwIfAborted: (signal: AbortSignal | undefined) => void = helpers.throwIfAborted;
