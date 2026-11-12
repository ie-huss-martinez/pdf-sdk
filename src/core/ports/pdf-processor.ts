import type { PdfBuildJob, PdfBuildProgress } from "../model/build-job.js";
import type { PdfTransferOptions } from "./options.js";

/**
 * Options for {@link PdfProcessor.build}.
 *
 * @public
 */
export interface PdfBuildOptions extends PdfTransferOptions {
  /** Called as the build moves through its steps. */
  readonly onProgress?: (progress: PdfBuildProgress) => void;
}

/**
 * The port for transforming PDFs: build an output document from sources,
 * pages and export options (ADR 0003, ADR 0008). The SDK's qpdf adapter
 * implements it in a worker; hosts can pass their own to the editor's
 * `processor` prop, and every implementation must pass the processor's
 * contract tests.
 *
 * One call runs the whole pipeline, so the bytes cross the worker boundary
 * once in each direction. Failures reject with `PdfError`.
 *
 * @public
 */
export interface PdfProcessor {
  /**
   * Builds a document. The sources' bytes are copied unless `transfer` is
   * set. The result is a new buffer the caller owns.
   *
   * @throws `PdfError` with `INVALID_PDF` when a source can't be read,
   *   `PASSWORD_REQUIRED` when one is encrypted, and `TypeError` or
   *   `RangeError` for a job that refers to an unknown source or page.
   */
  build(job: PdfBuildJob, options?: PdfBuildOptions): Promise<Uint8Array>;
  /** Releases the processor and its worker. Pending builds reject. */
  destroy(): Promise<void>;
}
