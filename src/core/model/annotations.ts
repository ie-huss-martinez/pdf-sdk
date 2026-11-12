import type { PdfPoint } from "./geometry.js";

/**
 * A colour as `#rrggbb`.
 *
 * @public
 */
export type PdfColor = `#${string}`;

/**
 * A freehand pen stroke, or a highlighter stroke, which is drawn translucent.
 *
 * @public
 */
export interface PdfStrokeAnnotation {
  readonly id: string;
  readonly type: "pen" | "highlight";
  /** The stroke's points, in page fractions. */
  readonly points: readonly PdfPoint[];
  readonly color: PdfColor;
  /** Line width, as a fraction of the page's height. */
  readonly width: number;
}

/**
 * A text note placed on the page.
 *
 * @public
 */
export interface PdfTextAnnotation {
  readonly id: string;
  readonly type: "text";
  /** The top-left corner of the text, in page fractions. */
  readonly at: PdfPoint;
  /** The note's text. It's drawn as text, never interpreted as markup. */
  readonly text: string;
  /** Font size, as a fraction of the page's height. */
  readonly size: number;
  readonly color: PdfColor;
}

/**
 * A drawn signature, or another image, placed on the page.
 *
 * @public
 */
export interface PdfImageAnnotation {
  readonly id: string;
  readonly type: "signature";
  /** The top-left corner of the image, in page fractions. */
  readonly at: PdfPoint;
  /** Width, as a fraction of the page's width. */
  readonly width: number;
  /** Height, as a fraction of the page's height. */
  readonly height: number;
  /** The image as PNG bytes. */
  readonly png: Uint8Array;
}

/**
 * Anything the editor draws on top of a page until it's flattened on export
 * (ADR 0003). Annotations are plain data, so they can be stored in commands
 * and sent to the processing worker.
 *
 * @public
 */
export type PdfAnnotation = PdfStrokeAnnotation | PdfTextAnnotation | PdfImageAnnotation;
