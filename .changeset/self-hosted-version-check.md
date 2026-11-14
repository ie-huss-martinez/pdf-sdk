---
"@hussmartinez/pdf-sdk": patch
---

Self-hosted assets left over from another version now fail clearly. If you upgrade without copying `dist/assets/` again, opening or exporting fails with `WORKER_START_FAILED`, and its `details`, `{ asset, expected, actual }`, name the file and both versions. Before, the processing worker from another version ran anyway, and pdf.js's worker from another version made every document fail to open with `PROCESSING_FAILED`, as if the file were at fault.

`createPdfJsEngine` and `createPdfProcessor` check `assetsUrl` when you call them: a relative URL with no page to resolve it against, or a URL with a query or fragment, throws `TypeError` there instead of failing later. `PdfEditor` and `PdfSessionProvider` still render on a server with a relative `assetsUrl`, such as `"/pdf-sdk/"`, because they create their engine and processor only on first use, in the browser; a query or fragment throws `TypeError` as they render.
