---
"@hussmartinez/pdf-sdk": patch
---

`PdfViewer` no longer snaps back to where it was when you scroll just as page sizes change, such as while pages are still being measured after opening a document or jumping to a page. It used to restore its previous position over your scroll, and keep the page you scrolled away from as the current one.
