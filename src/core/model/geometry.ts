/**
 * A point on a page, as fractions of the page's unrotated media box: `x`
 * from the left edge and `y` from the top edge, each from 0 to 1. Fractions
 * keep positions independent of zoom and of the rotation the page is shown
 * with (ADR 0003).
 *
 * @public
 */
export interface PdfPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A rectangle on a page, in the same fractions as {@link PdfPoint}: its
 * top-left corner, width and height.
 *
 * @public
 */
export interface PdfRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A rotation in degrees, clockwise.
 *
 * @public
 */
export type PdfRotation = 0 | 90 | 180 | 270;

/**
 * Adds two rotations, such as a page's own `/Rotate` and the rotation the
 * page plan adds to it.
 *
 * @example
 * ```ts
 * addRotation(270, 180); // 90
 * addRotation(90, -90); // 0
 * ```
 *
 * @param rotation - The current rotation.
 * @param angle - The angle to add, positive clockwise, in multiples of 90.
 * @throws `RangeError` if `angle` isn't a multiple of 90.
 * @public
 */
export function addRotation(rotation: PdfRotation, angle: number): PdfRotation {
  if (!Number.isInteger(angle) || angle % 90 !== 0) {
    throw new RangeError(`A rotation must be a multiple of 90 degrees, received ${angle}.`);
  }
  return ((((rotation + angle) % 360) + 360) % 360) as PdfRotation;
}
