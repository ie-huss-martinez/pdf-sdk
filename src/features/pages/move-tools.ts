import { defineTool } from "@hussmartinez/sdk-core";
import type { PdfSessionSnapshot } from "../../core/session/session.js";
import {
  hasDocument,
  type PdfTool,
  type PdfToolContext,
  type PdfToolState,
} from "../tool-types.js";
import { targetPages } from "./rotate-tools.js";

/** Which way the move tools move pages. */
export type MoveDirection = "earlier" | "later";

/**
 * The move for the selected pages, or the current one, as `pdf.movePages`'s
 * `pages` and `to`, or `undefined` when there's nothing to move. Pages that
 * aren't next to each other are gathered into one block, in plan order:
 * "earlier" puts its first page one position before where it was, and
 * "later" puts its last page one position after (docs/adr/0008).
 */
export function moveOf(
  snapshot: PdfSessionSnapshot,
  direction: MoveDirection,
): { readonly pages: readonly string[]; readonly to: number } | undefined {
  if (snapshot.status !== "ready") return undefined;
  const chosen = new Set(targetPages(snapshot));
  const order = snapshot.plan.pages.map((page) => page.key);
  const indexes = order.flatMap((key, index) => (chosen.has(key) ? [index] : []));
  const first = indexes[0];
  const last = indexes.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const pages = indexes.map((index) => order[index] as string);
  const block = last - first + 1 === pages.length;
  const others = order.length - pages.length;
  if (direction === "earlier") {
    if (block && first === 0) return undefined;
    return { pages, to: Math.max(0, first - 1) };
  }
  if (block && last === order.length - 1) return undefined;
  return { pages, to: Math.min(others, last + 2 - pages.length) };
}

function move({ session }: PdfToolContext, direction: MoveDirection): void {
  const before = session.getSnapshot();
  const found = moveOf(before, direction);
  if (!found) return;
  session.execute({ type: "pdf.movePages", pages: found.pages, to: found.to });
  // The moved pages stay chosen, and the current page stays current if it
  // moved, so the user keeps their place (docs/adr/0008).
  session.select(found.pages);
  const current = before.currentPage;
  session.goToPage(
    current !== undefined && found.pages.includes(current) ? current : (found.pages[0] as string),
  );
}

/**
 * Whether the tool can move pages in `direction`. Tools call it from an arrow
 * of their own rather than being given a function it returns: a call in a
 * tool's definition would keep every tool in a bundle that imports none of
 * them (sdk-core ADR 0056).
 */
const canMove = (direction: MoveDirection, { snapshot }: PdfToolState): boolean =>
  hasDocument({ snapshot }) && moveOf(snapshot, direction) !== undefined;

/**
 * Moves the selected pages, or the current one, one position earlier. Its
 * keys, Alt+↑ (Option+↑ on macOS), work in the thumbnails, never
 * editor-wide (docs/adr/0008).
 */
export const moveEarlierTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.move-earlier",
  label: "tools.move-earlier",
  icon: "move-up",
  group: "pages",
  isEnabled: (state) => canMove("earlier", state),
  run: (context) => move(context, "earlier"),
});

/** Moves the selected pages, or the current one, one position later: Alt+↓ in the thumbnails. */
export const moveLaterTool: PdfTool = /* @__PURE__ */ defineTool({
  id: "pdf.move-later",
  label: "tools.move-later",
  icon: "move-down",
  group: "pages",
  isEnabled: (state) => canMove("later", state),
  run: (context) => move(context, "later"),
});
