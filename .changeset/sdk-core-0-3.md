---
"@hussmartinez/pdf-sdk": patch
---

Depends on `@hussmartinez/sdk-core` `^0.3.0`, the first release of it after 0.1.2 that's published with its built files. If your application also depends on sdk-core, use `^0.3.0` too, and avoid 0.1.3 and 0.2.0, which fail to import.

`pdfMessages` now includes sdk-core's names for keys, such as `"keys.control": "Ctrl"` and `"keys.apple.meta": "⌘"`, which keyboard shortcut labels use. Override them like any other message to translate them.
