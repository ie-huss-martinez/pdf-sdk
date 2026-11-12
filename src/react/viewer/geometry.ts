import type { PdfRotation } from "../../core/model/geometry.js";

/** A page's box on screen, and how to lay the unrotated page over it. */
export interface PageGeometry {
  /** The page's width and height on screen, after rotation, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** The unrotated page's width and height, in CSS pixels. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /**
   * The CSS transform that puts a layer of the unrotated page's size, with
   * its origin at its top-left corner, over the rotated page, so overlays
   * positioned in unrotated page fractions land where the page shows them.
   */
  readonly transform: string;
}

/**
 * Lays out a page of `width` × `height` points, shown with `rotation`, at a
 * given CSS width.
 */
export function pageGeometry(
  size: { readonly width: number; readonly height: number },
  rotation: PdfRotation,
  displayWidth: number,
): PageGeometry {
  const turned = rotation === 90 || rotation === 270;
  const scale = displayWidth / (turned ? size.height : size.width);
  const pageWidth = size.width * scale;
  const pageHeight = size.height * scale;
  const width = turned ? pageHeight : pageWidth;
  const height = turned ? pageWidth : pageHeight;
  const transform = {
    0: "none",
    90: `translate(${width}px, 0) rotate(90deg)`,
    180: `translate(${width}px, ${height}px) rotate(180deg)`,
    270: `translate(0, ${height}px) rotate(270deg)`,
  }[rotation];
  return { width, height, pageWidth, pageHeight, transform };
}
