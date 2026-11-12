import { isSdkError } from "@hussmartinez/sdk-core";
import { PdfError } from "./pdf-error.js";

/**
 * Makes any failure a `PdfError`, as every port promises: a `PdfError` as
 * it is, another `SdkError`, such as the worker client's own `ABORTED` or
 * `WORKER_CRASHED`, with its code, details and message kept, and anything
 * else as `PROCESSING_FAILED`. The original is kept as `cause`.
 *
 * @internal
 */
export function asPdfError(reason: unknown, message = "PDF processing failed."): PdfError {
  if (reason instanceof PdfError) {
    return reason;
  }
  if (isSdkError(reason)) {
    return new PdfError(reason.code as never, reason.message, {
      ...(reason.details === undefined ? {} : { details: reason.details }),
      cause: reason,
    });
  }
  return new PdfError("PROCESSING_FAILED", message, { cause: reason });
}

/**
 * The error an aborted call rejects with, as the family's worker client does
 * (ADR 0018, ADR 0020): the reason itself when it's an `SdkError`, such as a
 * file policy's `PROCESSING_TIME_EXCEEDED`, `TIMEOUT` for a timeout, and
 * `ABORTED` otherwise. The reason is kept as `cause`.
 *
 * @internal
 */
export function abortError(signal: AbortSignal): PdfError {
  const { reason } = signal;
  if (reason instanceof PdfError) {
    return reason;
  }
  if (isSdkError(reason)) {
    return asPdfError(reason);
  }
  const timedOut = reason instanceof DOMException && reason.name === "TimeoutError";
  return new PdfError(
    timedOut ? "TIMEOUT" : "ABORTED",
    timedOut ? "The operation timed out." : "The operation was cancelled.",
    { cause: reason },
  );
}

/**
 * Throws {@link abortError} if the signal has been aborted.
 *
 * @internal
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}
