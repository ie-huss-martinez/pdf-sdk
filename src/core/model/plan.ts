import type { PdfAnnotation } from "./annotations.js";
import type { PdfFieldValue } from "./document.js";
import type { PdfRotation } from "./geometry.js";

/**
 * One page of the page plan (docs/adr/0003): a page of a source document,
 * with a rotation added to its own, and the annotations drawn on it. The key
 * is stable while the page moves, so annotations, thumbnails and the
 * selection follow it.
 *
 * @public
 */
export interface PdfPlanPage {
  /** Unique within the session, and never reused. */
  readonly key: string;
  /** The ID of the source document the page comes from. */
  readonly source: string;
  /** The page's zero-based index in its source. */
  readonly pageIndex: number;
  /** Rotation added to the page's own `/Rotate`. */
  readonly rotation: PdfRotation;
  /** Annotations drawn on the page, in drawing order. */
  readonly annotations: readonly PdfAnnotation[];
}

/**
 * The document being edited, as a plan over immutable sources
 * (docs/adr/0003): the pages in order, and form values per source. Bytes
 * are only built from it on export.
 *
 * @public
 */
export interface PdfPlan {
  readonly pages: readonly PdfPlanPage[];
  /** Form values set in the session, by source ID, then field name. */
  readonly formValues: Readonly<Record<string, Readonly<Record<string, PdfFieldValue>>>>;
}

/** An empty plan. @internal */
export const EMPTY_PLAN: PdfPlan = Object.freeze({
  pages: Object.freeze([]),
  formValues: Object.freeze({}),
});
