/**
 * The parts of `PdfViewer` that take extra classes through `classNames`.
 *
 * @public
 */
export type PdfViewerPart =
  | "root"
  | "pages"
  | "page"
  | "canvas"
  | "textLayer"
  | "linkLayer"
  | "link"
  | "error"
  | "empty";

/**
 * Extra classes for each part of `PdfViewer`.
 *
 * @public
 */
export type PdfViewerClassNames = Readonly<Partial<Record<PdfViewerPart, string>>>;
