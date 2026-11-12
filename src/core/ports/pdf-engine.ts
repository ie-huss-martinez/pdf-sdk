import type {
  PdfBytes,
  PdfFormField,
  PdfLink,
  PdfPageInfo,
  PdfTextContent,
} from "../model/document.js";
import type { PdfRotation } from "../model/geometry.js";
import type { PdfCallOptions, PdfTransferOptions } from "./options.js";

/**
 * The most pixels an engine draws into one canvas. Larger renders are drawn
 * at a lower resolution instead, because iOS Safari, the strictest
 * supported browser, refuses larger canvases (ADR 0004).
 *
 * @public
 */
export const PDF_MAX_CANVAS_PIXELS = 16_777_216;

/**
 * How to render a page.
 *
 * @public
 */
export interface PdfRenderOptions extends PdfCallOptions {
  /** CSS pixels per PDF point. `1` renders a US Letter page 612 CSS pixels wide. */
  readonly scale: number;
  /**
   * Device pixels per CSS pixel, usually `window.devicePixelRatio`. Defaults
   * to 1. The engine lowers it as needed to stay within
   * {@link PDF_MAX_CANVAS_PIXELS}.
   */
  readonly pixelRatio?: number;
  /** Rotation added to the page's own, for the page plan (ADR 0003). Defaults to 0. */
  readonly rotation?: PdfRotation;
}

/**
 * An open document. Pages are addressed by zero-based index.
 *
 * @public
 */
export interface PdfDocumentHandle {
  /** The number of pages. */
  readonly pageCount: number;
  /**
   * Reads a page's size and rotation.
   *
   * @throws `RangeError` for an index outside the document.
   */
  getPage(pageIndex: number, options?: PdfCallOptions): Promise<PdfPageInfo>;
  /**
   * Draws a page into a canvas, sizing the canvas's pixel dimensions and its
   * CSS `width` and `height`.
   *
   * @throws `RangeError` for an index outside the document.
   */
  renderPage(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    options: PdfRenderOptions,
  ): Promise<void>;
  /**
   * Reads a page's text, for the text layer and search.
   *
   * @throws `RangeError` for an index outside the document.
   */
  getTextContent(pageIndex: number, options?: PdfCallOptions): Promise<PdfTextContent>;
  /**
   * Reads the form fields on a page.
   *
   * @throws `RangeError` for an index outside the document.
   */
  getFormFields(pageIndex: number, options?: PdfCallOptions): Promise<readonly PdfFormField[]>;
  /**
   * Reads the links on a page to web pages and email addresses, filtered
   * with `safeLinkUrl` (ADR 0012).
   *
   * @throws `RangeError` for an index outside the document.
   */
  getLinks(pageIndex: number, options?: PdfCallOptions): Promise<readonly PdfLink[]>;
  /** Releases the document. Pending calls reject, and later calls throw. */
  destroy(): Promise<void>;
}

/**
 * The port for viewing PDFs: open a document, then read and render its pages
 * (ADR 0008). The SDK's pdf.js adapter implements it; hosts can pass their
 * own to the editor's `engine` prop, and every implementation must pass the
 * engine's contract tests.
 *
 * Failures reject with `PdfError`: `INVALID_PDF` for a file that can't be
 * parsed, `PASSWORD_REQUIRED` for an encrypted one, and sdk-core's codes for
 * cancellation and worker failures.
 *
 * @public
 */
export interface PdfEngine {
  /**
   * Opens a document. The bytes are copied unless `transfer` is set.
   */
  open(source: PdfBytes, options?: PdfTransferOptions): Promise<PdfDocumentHandle>;
  /** Releases the engine and its worker. Open documents are destroyed. */
  destroy(): Promise<void>;
}
