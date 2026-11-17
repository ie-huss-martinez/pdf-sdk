import { defineTool } from "@hussmartinez/sdk-core";
import { hasDocument, type PdfTool } from "../tool-types.js";

/**
 * Builds the document and saves it: through the browser as a download, or
 * through the host's `onExport` (docs/adr/0009). No shortcut: Ctrl or ⌘+S
 * stays the browser's. It's disabled while a save runs, so it can't run
 * twice.
 */
export const downloadTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.download",
  label: "tools.download",
  icon: "download",
  group: "save",
  isEnabled: (state) => hasDocument(state) && !state.saving,
  run: ({ save }) => save?.(),
});
