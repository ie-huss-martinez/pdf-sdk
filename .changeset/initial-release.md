---
"@hussmartinez/pdf-sdk": minor
---

First release of `@hussmartinez/pdf-sdk`, a PDF SDK that works entirely in the browser: files are opened and processed on the user's device and never uploaded. This release provides the headless core. The React editor and the `<hm-pdf-editor>` element arrive in later releases.

- **Viewing PDFs:** `createPdfJsEngine()` opens documents with pdf.js in a Web Worker, renders pages to a canvas at any scale and rotation, and reads each page's text and form fields. It loads only when the first document opens, runs with scripting and XFA off, and makes no network requests. Scanned documents with JBIG2 or JPX images, and CJK text whose fonts aren't embedded, render correctly. The data they need is bundled and loaded only when a document needs it.
- **Two asset modes:** by default everything is inlined, which needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'` in a Content Security Policy. Or serve the package's `dist/assets/pdfjs/` from your own origin and pass `assetsUrl`, for policies without `blob:` workers and for accurate CMYK and ICC colour, which inline mode approximates.
- **Contracts for your own engines:** `PdfEngine` and `PdfProcessor` describe what the SDK needs from a PDF engine, so you can supply your own. `PdfBuildJob` describes a whole export in one request: pages from several documents in any order, with rotations, form values, annotations, compression and encryption.
- **Errors:** every failure is a `PdfError` with a stable `code`, such as `INVALID_PDF`, `PASSWORD_REQUIRED` or `TOO_MANY_PAGES`, and structured `details`. `isPdfError(error, code)` checks one, across workers and copies of the package.
- **Limits for untrusted files:** `pdfLimits` adds `maxPages`, `maxSessionSize` and `maxImagePixels` to the family's limits on file size, file count, decoded size and processing time. Set them with a `filePolicy`; a misspelt limit name throws instead of being ignored.
- **Translatable text:** `pdfMessages` is the English catalogue for every error code and limit warning, for `createMessages` from `@hussmartinez/sdk-core`. Error text comes from the code and its details, never from the error's message.
