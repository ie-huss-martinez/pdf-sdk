import { defineTool } from "@hussmartinez/sdk-core";
import type { PdfTool } from "../tool-types.js";

/** Undoes the last edit (sdk-core ADR 0010). */
export const undoTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.undo",
  label: "tools.undo",
  icon: "undo",
  group: "history",
  isEnabled: ({ snapshot }) => snapshot.canUndo,
  run: ({ session }) => {
    session.undo();
  },
  shortcuts: "undo",
});

/** Redoes the last undone edit. */
export const redoTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.redo",
  label: "tools.redo",
  icon: "redo",
  group: "history",
  isEnabled: ({ snapshot }) => snapshot.canRedo,
  run: ({ session }) => {
    session.redo();
  },
  shortcuts: "redo",
});
