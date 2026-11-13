"use client";

/**
 * React editor of the PDF SDK: `PdfEditor`, its building blocks and hooks.
 *
 * @remarks
 * A client entry: it starts with `"use client"`, which the build keeps
 * (ADR 0007). React and React DOM 18.3 or later are optional peer
 * dependencies.
 *
 * @packageDocumentation
 */

export type { PdfTool, PdfToolContext, PdfToolState } from "./features/tool-types.js";
export { pdfTools } from "./features/tools.js";
export { PdfEditor } from "./react/editor/PdfEditor.js";
export type {
  PdfEditorChange,
  PdfEditorHandle,
  PdfEditorPart,
  PdfEditorProps,
} from "./react/editor/types.js";
export { usePdfDocument, usePdfMessages, usePdfSession } from "./react/hooks.js";
export type { PdfSessionProviderProps } from "./react/PdfSessionProvider.js";
export { PdfSessionProvider } from "./react/PdfSessionProvider.js";
export type { PdfThumbnailsPart, PdfThumbnailsProps } from "./react/thumbnails/PdfThumbnails.js";
export { PdfThumbnails } from "./react/thumbnails/PdfThumbnails.js";
export { pdfIcons } from "./react/toolbar/icons.js";
export type { PdfToolbarProps } from "./react/toolbar/PdfToolbar.js";
export { PdfToolbar } from "./react/toolbar/PdfToolbar.js";
export type { PdfViewerProps } from "./react/viewer/PdfViewer.js";
export { PdfViewer } from "./react/viewer/PdfViewer.js";
export type { PdfViewerClassNames, PdfViewerPart } from "./react/viewer/types.js";
