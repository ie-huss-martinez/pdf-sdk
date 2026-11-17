---
"@hussmartinez/pdf-sdk": patch
---

`PdfEditor` now sets its own text in ui's type: `--hm-font-family`, `--hm-font-size-body` and `--hm-line-height-body`. The start area, the alerts and the page numbers no longer inherit the host page's font, which was often the browser's default serif. A host's unlayered CSS still overrides these, and `unstyled` editors keep inheriting them.
