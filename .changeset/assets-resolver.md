---
"@hussmartinez/pdf-sdk": patch
---

`createPdfJsEngine` and `createPdfProcessor` now accept an `assetsUrl` relative to the page, such as `"/pdf-sdk/"`, when you call them on a server. They resolve it when their worker first starts, in the browser, as `PdfEditor` and `PdfSessionProvider` already did. Before, they threw `TypeError` there. A URL with a query or a fragment still throws `TypeError` at once.
