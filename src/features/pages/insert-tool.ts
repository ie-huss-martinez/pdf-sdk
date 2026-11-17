import { defineTool } from "@hussmartinez/sdk-core";
import { hasDocument, type PdfTool } from "../tool-types.js";

/**
 * Asks for another PDF and inserts all its pages after the current page,
 * as one undoable step: how two documents are merged (docs/adr/0008). The
 * file policy applies to the combined document, and a failed insert leaves
 * the document as it was. No shortcut: the picker needs a click or a key
 * press on the button anyway.
 */
export const insertPagesTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.insert-pages",
  label: "tools.insert-pages",
  icon: "page-add",
  group: "file",
  isEnabled: (state) => hasDocument(state) && !state.inserting,
  run: ({ chooseInsertFile }) => chooseInsertFile?.(),
});
