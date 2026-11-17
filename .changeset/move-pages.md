---
"@hussmartinez/pdf-sdk": minor
---

`PdfEditor` can reorder pages. The new `pdf.move-earlier` and `pdf.move-later` tools, in `pdfTools` and in the toolbar's Pages group with ui's move-up and move-down icons, work like this:

- They move the selected pages, or the current one, one position earlier or later, as one undoable step each.
- Pages that aren't next to each other are gathered into one block, in their order.
- The moved pages stay selected and focused, and the move is announced, for example "Moved 2 pages to position 4.".
- A tool is disabled when its block is already at that end.

In the thumbnails, Alt+↑ and Alt+↓ (Option on macOS) run them. They do nothing elsewhere in the editor, and nothing with other modifiers. These keys don't clash with browser or system shortcuts; ADR 0008 records the check.

`PdfThumbnails` used on its own takes an `onMove(direction)` prop for those keys. If a moved or removed thumbnail had focus, focus now stays in the list.
