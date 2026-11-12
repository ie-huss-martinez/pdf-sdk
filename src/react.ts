"use client";

/**
 * React editor of the PDF SDK: `PdfEditor`, its building blocks and hooks.
 *
 * @remarks
 * A client entry: it starts with `"use client"`, which the build keeps
 * (ADR 0007). React and React DOM 18.3 or later are optional peer
 * dependencies. The full editor arrives in a later release.
 *
 * @packageDocumentation
 */

export { usePdfDocument, usePdfMessages, usePdfSession } from "./react/hooks.js";
export type { PdfSessionProviderProps } from "./react/PdfSessionProvider.js";
export { PdfSessionProvider } from "./react/PdfSessionProvider.js";
export type { PdfViewerProps } from "./react/viewer/PdfViewer.js";
export { PdfViewer } from "./react/viewer/PdfViewer.js";
export type { PdfViewerClassNames, PdfViewerPart } from "./react/viewer/types.js";
