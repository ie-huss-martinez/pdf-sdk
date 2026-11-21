---
"@hussmartinez/pdf-sdk": patch
---

pdf-sdk now cleans file names with `cleanFileName` from `@hussmartinez/sdk-core` (sdk-core ADR 0051), instead of a copy of its own, and depends on `@hussmartinez/sdk-core` `^0.4.7`. The rules are the same, with one addition: an unpaired surrogate is removed. That affects a `name` passed to `session.open()`, `session.insert()` or `PdfEditorHandle.open()`, and a host's `downloadName`. Such a string isn't well-formed Unicode, and `encodeURIComponent` throws on it. A `File`'s own name can't hold one, because the browser already replaces it.

If your app also depends on `@hussmartinez/sdk-core` directly, move it to 0.4.7 too, so your app keeps one copy (sdk-core ADR 0047).
