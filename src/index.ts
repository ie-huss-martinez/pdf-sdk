/**
 * Headless core of the PDF SDK: contracts, errors, the document session and
 * operations.
 *
 * @remarks
 * This entry is server-safe: it has no React and touches no DOM on import, so
 * Server Components and Node can import it (ADR 0004, ADR 0007).
 *
 * @packageDocumentation
 */

export type { PdfErrorCode } from "./core/errors/pdf-error.js";
export { isPdfError, PdfError } from "./core/errors/pdf-error.js";
export type {
  PdfFilePolicy,
  PdfFilePolicyOverrides,
  PdfLimitDefinitions,
  PdfLimitName,
} from "./core/errors/pdf-limits.js";
export { pdfLimitDefinitions, pdfLimits } from "./core/errors/pdf-limits.js";
export type { PdfMessageCatalogue } from "./messages/en.js";
export { pdfMessages } from "./messages/en.js";
