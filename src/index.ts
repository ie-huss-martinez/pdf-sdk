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

export type { PdfJsEngineOptions } from "./adapters/pdfjs/pdfjs-engine.js";
export { createPdfJsEngine } from "./adapters/pdfjs/pdfjs-engine.js";
export type { PdfErrorCode } from "./core/errors/pdf-error.js";
export { isPdfError, PdfError } from "./core/errors/pdf-error.js";
export type {
  PdfFilePolicy,
  PdfFilePolicyOverrides,
  PdfLimitDefinitions,
  PdfLimitName,
} from "./core/errors/pdf-limits.js";
export { pdfLimitDefinitions, pdfLimits } from "./core/errors/pdf-limits.js";
export type {
  PdfAnnotation,
  PdfColor,
  PdfImageAnnotation,
  PdfStrokeAnnotation,
  PdfTextAnnotation,
} from "./core/model/annotations.js";
export type {
  PdfBuildJob,
  PdfBuildPage,
  PdfBuildProgress,
  PdfBuildSource,
  PdfBuildStep,
  PdfCompression,
  PdfEncryption,
  PdfImageCompression,
} from "./core/model/build-job.js";
export type {
  PdfBytes,
  PdfFieldValue,
  PdfFormField,
  PdfPageInfo,
  PdfTextContent,
  PdfTextItem,
} from "./core/model/document.js";
export type { PdfPoint, PdfRect, PdfRotation } from "./core/model/geometry.js";
export { addRotation } from "./core/model/geometry.js";
export type { PdfCallOptions, PdfTransferOptions } from "./core/ports/options.js";
export type {
  PdfDocumentHandle,
  PdfEngine,
  PdfRenderOptions,
} from "./core/ports/pdf-engine.js";
export { PDF_MAX_CANVAS_PIXELS } from "./core/ports/pdf-engine.js";
export type { PdfBuildOptions, PdfProcessor } from "./core/ports/pdf-processor.js";
export type { PdfMessageCatalogue } from "./messages/en.js";
export { pdfMessages } from "./messages/en.js";
