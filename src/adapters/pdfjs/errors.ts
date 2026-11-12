import { isPdfError, PdfError } from "../../core/errors/pdf-error.js";

const INVALID = new Set(["InvalidPDFException", "FormatError", "MissingPDFException"]);

/**
 * Turns whatever pdf.js rejected with into a `PdfError`, keeping it as
 * `cause`. pdf.js's exceptions cross its worker boundary as plain objects
 * with a `name`, so they're recognised by name.
 */
export function fromPdfJsError(reason: unknown, message: string): PdfError | RangeError {
  if (isPdfError(reason) || reason instanceof RangeError) {
    return reason;
  }
  const name = typeof reason === "object" && reason !== null ? (reason as Error).name : undefined;
  if (name === "PasswordException") {
    return new PdfError("PASSWORD_REQUIRED", "The PDF is encrypted.", { cause: reason });
  }
  if (name !== undefined && INVALID.has(name)) {
    return new PdfError("INVALID_PDF", "The file isn't a readable PDF.", { cause: reason });
  }
  return new PdfError("PROCESSING_FAILED", message, { cause: reason });
}
