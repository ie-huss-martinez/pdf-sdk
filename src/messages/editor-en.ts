import { defineMessages, plural } from "@hussmartinez/sdk-core";

/**
 * The text of the SDK's interface: the editor, its toolbar and tools, the
 * viewer and the thumbnails. Only the React entry loads it, through
 * `pdfEditorMessages`, so the server-safe entry carries no interface text
 * (docs/adr/0010). Keys use the components' prefixes, never one of ui's
 * (sdk-core ADR 0046).
 */
export const pdfEditorText = /* @__PURE__ */ defineMessages({
  "viewer.label": "Document",
  "viewer.empty": "No document is open.",
  "viewer.page": "Page {page} of {count}",
  "viewer.webLink": "Link to {destination}, opens in a new tab",
  "viewer.emailLink": "Email {destination}",
  "thumbnails.label": "Pages",
  "thumbnails.page": "Page {page} of {count}",
  "thumbnails.number": "{page}",
  "editor.label": "PDF editor",
  "editor.start.title": "Open a PDF to get started",
  "editor.start.retryTitle": "Try another PDF",
  "editor.start.choose": "Choose a PDF",
  "editor.start.retry": "Choose another PDF",
  "editor.start.hint": "Or drop one here. Your file stays on this device and is never uploaded.",
  "editor.opening": "Opening the PDF…",
  "editor.opened": /* @__PURE__ */ plural("count", {
    one: "Opened a PDF with {count} page.",
    other: "Opened a PDF with {count} pages.",
  }),
  "editor.closed": "The PDF was closed.",
  "editor.undone": "Undone.",
  "editor.redone": "Redone.",
  "editor.rotated": /* @__PURE__ */ plural("count", {
    one: "Rotated {count} page.",
    other: "Rotated {count} pages.",
  }),
  "editor.deleted": /* @__PURE__ */ plural("count", {
    one: "Deleted {count} page.",
    other: "Deleted {count} pages.",
  }),
  "toolbar.label": "PDF tools",
  "toolbar.groups.file": "File",
  "toolbar.groups.history": "History",
  "toolbar.groups.pages": "Pages",
  "toolbar.groups.other": "More tools",
  "tools.open": "Open a PDF",
  "tools.undo": "Undo",
  "tools.redo": "Redo",
  "tools.rotate-left": "Rotate left",
  "tools.rotate-right": "Rotate right",
  "tools.delete-pages": "Delete pages",
});
