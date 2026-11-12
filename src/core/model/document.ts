import type { PdfRect, PdfRotation } from "./geometry.js";

/**
 * PDF bytes as callers pass them. A `Uint8Array` may be a view into a larger
 * buffer; only its own bytes are used.
 *
 * @public
 */
export type PdfBytes = ArrayBuffer | Uint8Array;

/**
 * Facts about one page of a source document.
 *
 * @public
 */
export interface PdfPageInfo {
  /** Width of the unrotated media box, in PDF points (1/72 inch). */
  readonly width: number;
  /** Height of the unrotated media box, in PDF points. */
  readonly height: number;
  /** The page's own rotation, from its `/Rotate` entry. */
  readonly rotation: PdfRotation;
}

/**
 * A run of text on a page, for the text layer, selection, assistive
 * technology and search. Positions are fractions of the unrotated media box
 * ({@link PdfRect}).
 *
 * @public
 */
export interface PdfTextItem {
  /** The text, as the document encodes it. Always rendered as text, never as markup. */
  readonly text: string;
  /** The box the text occupies. */
  readonly rect: PdfRect;
  /** Rotation of the text's baseline, in degrees, counter-clockwise. */
  readonly angle: number;
  /** Whether a line break follows this item. */
  readonly endOfLine: boolean;
}

/**
 * The text of one page, in reading order as the document stores it.
 *
 * @public
 */
export interface PdfTextContent {
  readonly items: readonly PdfTextItem[];
}

/**
 * An AcroForm field widget on a page.
 *
 * @public
 */
export interface PdfFormField {
  /** The field's fully qualified name, unique within its document. */
  readonly name: string;
  /** The kind of field. Other kinds are not reported yet. */
  readonly type: "text" | "checkbox";
  /** Where the widget sits on the page. */
  readonly rect: PdfRect;
  /** The value stored in the document. */
  readonly value: PdfFieldValue;
  /** Whether the document marks the field as read-only. */
  readonly readOnly: boolean;
}

/**
 * A form field's value: text for text fields, checked or not for checkboxes.
 *
 * @public
 */
export type PdfFieldValue = string | boolean;
