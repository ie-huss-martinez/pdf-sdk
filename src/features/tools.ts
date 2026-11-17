import { redoTool, undoTool } from "./history/history-tools.js";
import { openTool } from "./open/open-tool.js";
import { deletePagesTool } from "./pages/delete-tool.js";
import { insertPagesTool } from "./pages/insert-tool.js";
import { moveEarlierTool, moveLaterTool } from "./pages/move-tools.js";
import { rotateLeftTool, rotateRightTool } from "./pages/rotate-tools.js";
import { downloadTool } from "./save/download-tool.js";
import type { PdfTool } from "./tool-types.js";

/**
 * Every tool the editor knows, in their default order (sdk-core ADR 0030).
 *
 * @public
 */
export const pdfTools: readonly PdfTool[] = [
  openTool,
  insertPagesTool,
  undoTool,
  redoTool,
  rotateLeftTool,
  rotateRightTool,
  moveEarlierTool,
  moveLaterTool,
  deletePagesTool,
  downloadTool,
];

/** The toolbar's default groups. */
export const DEFAULT_TOOLBAR: readonly (readonly string[])[] = [
  ["pdf.open", "pdf.insert-pages"],
  ["pdf.undo", "pdf.redo"],
  ["pdf.rotate-left", "pdf.rotate-right", "pdf.move-earlier", "pdf.move-later", "pdf.delete-pages"],
  ["pdf.download"],
];
