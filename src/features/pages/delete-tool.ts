import { defineTool } from "@hussmartinez/sdk-core";
import {
  hasDocument,
  type PdfTool,
  type PdfToolContext,
  type PdfToolState,
} from "../tool-types.js";
import { targetPages } from "./rotate-tools.js";

/** Whether deleting the targets would leave at least one page (docs/adr/0008). */
const canDelete = ({ snapshot }: PdfToolState): boolean => {
  const targets = targetPages(snapshot).length;
  return hasDocument({ snapshot }) && targets > 0 && targets < snapshot.plan.pages.length;
};

/**
 * Deletes the selected pages, or the current one, as one undoable step. The
 * page that takes the first deleted page's place, or the new last page,
 * becomes the selection and the current page (docs/adr/0008).
 */
function deletePages({ session }: PdfToolContext): void {
  const before = session.getSnapshot();
  if (!canDelete({ snapshot: before })) return;
  const pages = targetPages(before);
  const removed = new Set(pages);
  const first = before.plan.pages.findIndex((page) => removed.has(page.key));
  session.execute({ type: "pdf.deletePages", pages });
  const remaining = session.getSnapshot().plan.pages;
  const next = remaining[Math.min(first, remaining.length - 1)];
  if (!next) return;
  session.select([next.key]);
  session.goToPage(next.key);
}

/**
 * Deletes the selected pages, or the current one. A document keeps at least
 * one page. Its keys, Delete and Backspace, work in the thumbnails, where
 * the selection is shown, never editor-wide (docs/adr/0008).
 */
export const deletePagesTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.delete-pages",
  label: "tools.delete-pages",
  icon: "delete",
  group: "pages",
  isEnabled: canDelete,
  run: deletePages,
});

/**
 * Keys that run a tool only while focus is in the thumbnails, by tool ID,
 * as `aria-keyshortcuts` gives them. The toolbar advertises them on the
 * tools' buttons (docs/adr/0008).
 */
export const THUMBNAIL_KEYS: Readonly<Record<string, string>> = {
  "pdf.delete-pages": "Delete Backspace",
};
