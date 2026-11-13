import { redoTool, undoTool } from "./history/history-tools.js";
import { openTool } from "./open/open-tool.js";
import { rotateLeftTool, rotateRightTool } from "./pages/rotate-tools.js";
import type { PdfTool } from "./tool-types.js";

/**
 * Every tool the editor knows, in their default order (sdk-core ADR 0030).
 *
 * @public
 */
export const pdfTools: readonly PdfTool[] = [
  openTool,
  undoTool,
  redoTool,
  rotateLeftTool,
  rotateRightTool,
];

/** The toolbar's default groups. */
export const DEFAULT_TOOLBAR: readonly (readonly string[])[] = [
  ["pdf.open"],
  ["pdf.undo", "pdf.redo"],
  ["pdf.rotate-left", "pdf.rotate-right"],
];
