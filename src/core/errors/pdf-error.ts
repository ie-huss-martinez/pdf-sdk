import { isSdkError, type SdkCoreErrorCode, SdkError } from "@hussmartinez/sdk-core";

/**
 * Error codes of `@hussmartinez/pdf-sdk`: sdk-core's own codes, such as
 * `ABORTED`, `WORKER_CRASHED` and `FILE_TOO_LARGE`, plus the PDF SDK's. They
 * never change meaning once released.
 *
 * - `INVALID_PDF`: the file isn't a PDF, or is too damaged to open.
 * - `PASSWORD_REQUIRED`: the PDF is encrypted, and opening it needs a
 *   password.
 * - `PROCESSING_FAILED`: a PDF engine failed in a way no other code
 *   describes. `cause` holds the engine's error.
 * - `TOO_MANY_PAGES`: a document, or the pages after an insert, exceed the
 *   `maxPages` limit.
 * - `SESSION_TOO_LARGE`: the documents the session holds exceed the
 *   `maxSessionSize` limit.
 * - `IMAGE_TOO_LARGE`: an image exceeds the `maxImagePixels` limit. It's
 *   reported as a warning, because the image is skipped rather than the
 *   document failing (ADR 0004).
 *
 * Limit codes carry `details` with the `limit`, its `maximum`, the `actual`
 * value and the `unit`.
 *
 * @public
 */
export type PdfErrorCode =
  | SdkCoreErrorCode
  | "INVALID_PDF"
  | "PASSWORD_REQUIRED"
  | "PROCESSING_FAILED"
  | "TOO_MANY_PAGES"
  | "SESSION_TOO_LARGE"
  | "IMAGE_TOO_LARGE";

/**
 * The error `@hussmartinez/pdf-sdk` throws and rejects with, with a stable
 * `code`, structured `details` and the engine's error as `cause`. Show users
 * the text for its code from {@link pdfMessages}, never its `message`, which
 * is for developers and may contain text from the file.
 *
 * @example
 * ```ts
 * try {
 *   await session.open(file);
 * } catch (error) {
 *   if (isPdfError(error, "PASSWORD_REQUIRED")) {
 *     askForPassword();
 *   } else {
 *     show(messages.error(error));
 *   }
 * }
 * ```
 *
 * @public
 */
export class PdfError extends SdkError<PdfErrorCode> {
  /** Always `"PdfError"`, which survives minification and worker boundaries. */
  override readonly name = "PdfError";
}

/**
 * Checks whether a value is a {@link PdfError}, optionally with a given code.
 *
 * Unlike `instanceof`, it recognises errors from another copy of this
 * package or another realm, and errors rebuilt after crossing a worker
 * boundary.
 *
 * @param value - Any thrown value.
 * @param code - When given, the error must also have this code.
 * @public
 */
export function isPdfError<Code extends PdfErrorCode = PdfErrorCode>(
  value: unknown,
  code?: Code,
): value is PdfError & { readonly code: Code } {
  return isSdkError(value, code) && value.name === "PdfError";
}
