---
"@hussmartinez/pdf-sdk": minor
---

`PdfEditor` can merge PDFs. The new `pdf.insert-pages` tool, in `pdfTools` and in the toolbar's File group with ui's page-add icon, works like this:

- It asks for another PDF and inserts all its pages after the current page, as one undoable step.
- The inserted pages become the selection, the first one comes into view, and the insert is announced, for example "Inserted 2 pages after page 1.".
- The file policy applies to the combined document. `maxPages` counts the pages after the insert, and `maxSessionSize` counts every document the session holds.
- A failed insert, such as a file that isn't a PDF or one over a limit, leaves the document unchanged and shows why in the header.
- When the session had to drop the earliest undo steps to make room, the header says those edits can no longer be undone.

For your own tools, `PdfToolState` gains `inserting` and `PdfToolContext` gains `chooseInsertFile()`. Both are optional and absent outside the editor. `PdfToolbar` gains an `inserting` prop.

It now depends on `@hussmartinez/ui` `^0.8.0`, for that icon. If your app also depends on `@hussmartinez/ui` directly, move it to 0.8 too, so your app keeps one copy (sdk-core ADR 0047).
