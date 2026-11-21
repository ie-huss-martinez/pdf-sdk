---
"@hussmartinez/pdf-sdk": patch
---

Applications that import only part of `@hussmartinez/pdf-sdk/react` ship about 0.9 kB less (brotli), for example only `pdfEditorMessages`, `PdfViewer` or `PdfThumbnails`. Before, a call in the move tools' definitions stopped bundlers that can't prove it has no effects, such as esbuild, from dropping the editor's tools: every tool went into every such bundle. Nothing changes in the API or in what the editor does.
