import type { PdfBytes } from "./document.js";

/**
 * Copies PDF bytes into a new buffer that holds exactly them, so a caller's
 * buffer is never detached or changed, and a view into a larger buffer never
 * sends the rest of it (ADR 0002).
 *
 * @internal
 */
export function copyBytes(source: PdfBytes): Uint8Array<ArrayBuffer> {
  const view = source instanceof Uint8Array ? source : new Uint8Array(source);
  return new Uint8Array(view);
}

/**
 * Checks that a zero-based page index exists in a document.
 *
 * @throws `RangeError` otherwise.
 * @internal
 */
export function assertPageIndex(pageIndex: number, pageCount: number): void {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
    throw new RangeError(
      `Page index ${pageIndex} is outside the document, which has ${pageCount} pages.`,
    );
  }
}
