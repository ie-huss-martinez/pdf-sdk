import { defineTool } from "@hussmartinez/sdk-core";
import type { PdfTool } from "../tool-types.js";

/** Asks for a PDF and opens it. No shortcut: `Mod+O` is the browser's own. */
export const openTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.open",
  label: "tools.open",
  icon: "open",
  group: "file",
  run: ({ chooseFile }) => chooseFile(),
});
