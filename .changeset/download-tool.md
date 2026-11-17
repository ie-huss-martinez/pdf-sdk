---
"@hussmartinez/pdf-sdk": minor
---

`PdfEditor` can save the document. The new `pdf.download` tool, in `pdfTools` and in a new Save group at the end of the toolbar with ui's download icon, works like this:

- It builds the document in the worker and downloads it, named after the opened file, or `document.pdf`.
- The download uses a `blob:` URL: no request, and no change to your Content Security Policy.
- It has no shortcut, so Ctrl or ⌘+S stays the browser's.

New props:

- **`downloadName(info)`** names the file. `info` is `PdfDownloadNameInfo`: `sourceName` and `pageCount`. The result is cleaned as a file name, and `.pdf` is added if it's missing.
- **`onExport(bytes, info)`** receives the bytes instead of the browser downloading them. `info` is `PdfExportInfo`: `fileName` and `pageCount`. If it throws or rejects, the editor shows "The PDF couldn't be saved. Please try again." Your error is yours to log.

While a save runs:

- The button is disabled but keeps focus.
- The editor is `aria-busy`, and the header says "Preparing the PDF…".
- After a second, a Cancel button appears. Cancelling, or opening or closing a document, stops the save quietly.
- A failed build shows its error's text in the header's alert.

For your own tools, `PdfToolState` gains `saving` and `PdfToolContext` gains `save()`. Both are optional and absent outside the editor. `PdfToolbar` gains a `saving` prop.

If your app has its own Download button that calls `handle.export()`, you can remove it, or keep it and leave `pdf.download` out of `tools`.
