/**
 * Keys that run a tool only while focus is in the thumbnails, where the
 * selection is shown, by tool ID, as `aria-keyshortcuts` gives them. The
 * toolbar advertises them on the tools' buttons; the tools register no
 * editor-wide shortcut (docs/adr/0008).
 */
export const THUMBNAIL_KEYS: Readonly<Record<string, string>> = {
  "pdf.delete-pages": "Delete Backspace",
  "pdf.move-earlier": "Alt+ArrowUp",
  "pdf.move-later": "Alt+ArrowDown",
};
