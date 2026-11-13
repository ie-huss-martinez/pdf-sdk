import { defineTool } from "@hussmartinez/sdk-core";
import type { PdfSessionSnapshot } from "../../core/session/session.js";
import { hasDocument, type PdfTool, type PdfToolContext } from "../tool-types.js";

/**
 * The pages a page tool acts on: the selected pages, or the current page
 * when none is selected. Empty when no document is open.
 */
export function targetPages(snapshot: PdfSessionSnapshot): readonly string[] {
  if (snapshot.status !== "ready") return [];
  if (snapshot.selection.length > 0) return snapshot.selection;
  return snapshot.currentPage === undefined ? [] : [snapshot.currentPage];
}

function rotate({ session }: PdfToolContext, angle: -90 | 90): void {
  const pages = targetPages(session.getSnapshot());
  if (pages.length === 0) return;
  session.execute({ type: "pdf.rotatePages", pages, angle });
}

const hasTargets = ({ snapshot }: { snapshot: PdfSessionSnapshot }) =>
  hasDocument({ snapshot }) && targetPages(snapshot).length > 0;

/** Turns the selected pages, or the current one, a quarter turn anticlockwise. */
export const rotateLeftTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.rotate-left",
  label: "tools.rotate-left",
  icon: "rotate-left",
  group: "pages",
  isEnabled: hasTargets,
  run: (context) => rotate(context, -90),
  shortcuts: ["["],
});

/** Turns the selected pages, or the current one, a quarter turn clockwise. */
export const rotateRightTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.rotate-right",
  label: "tools.rotate-right",
  icon: "rotate-right",
  group: "pages",
  isEnabled: hasTargets,
  run: (context) => rotate(context, 90),
  shortcuts: ["]"],
});
