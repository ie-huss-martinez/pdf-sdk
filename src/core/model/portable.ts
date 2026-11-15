/**
 * The grid positions and sizes on a page are kept on: millionths of the
 * page (sdk-core ADR 0045, docs/adr/0003). Every position, size, stroke
 * width and text size the session stores is a whole number of millionths,
 * so a document saved in any language reproduces it exactly.
 *
 * @public
 */
export const PDF_POSITION_GRID = 1_000_000;

/**
 * The most Unicode code points in a page key, a source id or an annotation
 * id. Lengths count code points, not UTF-16 units (sdk-core ADR 0045).
 *
 * @public
 */
export const PDF_MAX_ID_LENGTH = 128;

/**
 * The most Unicode code points in a form field's name.
 *
 * @public
 */
export const PDF_MAX_FIELD_NAME_LENGTH = 1_000;

/**
 * The most Unicode code points in a text note, or a form field's text value.
 *
 * @public
 */
export const PDF_MAX_TEXT_LENGTH = 10_000;

/**
 * The most points in one pen or highlighter stroke.
 *
 * @public
 */
export const PDF_MAX_STROKE_POINTS = 10_000;

/**
 * A fraction of the page, snapped to {@link PDF_POSITION_GRID}. It rounds
 * with `Math.round`, so a half rounds up, toward positive infinity.
 *
 * @internal
 */
export function toGrid(fraction: number): number {
  return Math.round(fraction * PDF_POSITION_GRID) / PDF_POSITION_GRID;
}

/**
 * Whether text has more than `max` Unicode code points. A character outside
 * the Basic Multilingual Plane, such as an emoji, is one code point, though
 * JavaScript's `length` counts it as two.
 *
 * @internal
 */
export function longerThan(text: string, max: number): boolean {
  // Every code point is one or two UTF-16 units.
  if (text.length <= max) return false;
  let count = 0;
  for (const _ of text) {
    count += 1;
    if (count > max) return true;
  }
  return false;
}
