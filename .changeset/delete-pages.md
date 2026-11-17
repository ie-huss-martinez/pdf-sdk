---
"@hussmartinez/pdf-sdk": minor
---

`PdfEditor` can delete pages. The new `pdf.delete-pages` tool, in `pdfTools` and in the toolbar's Pages group with ui's delete icon, works like this:

- It deletes the selected pages, or the current page, as one undoable step.
- A document keeps at least one page, so the tool is disabled when every page would go.
- In the thumbnails, Delete or Backspace runs it. Those keys do nothing elsewhere in the editor.
- It announces "Deleted 2 pages.".
- The page that takes the first deleted page's place becomes the selection and the current page. Focus moves to its thumbnail if the deleted one had focus.

To leave deleting out, omit `pdf.delete-pages` from `tools`.

Other changes:

- **Undo and redo restore view state:** they now bring back the selection and current page that went with each step, not only the pages. Undoing a delete selects the restored pages again.
- **Disabled toolbar buttons keep focus:** they now use `aria-disabled` instead of the `disabled` attribute, so keyboard users stay in the toolbar. Tests that read `button.disabled`, or use jest-dom's `toBeDisabled()`, should check `aria-disabled="true"` instead. Playwright's `toBeDisabled()` already understands `aria-disabled`.
- **`PdfThumbnails` has an `onDelete` prop:** used on its own, it runs `onDelete` on Delete and Backspace.
