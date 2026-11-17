---
"@hussmartinez/pdf-sdk": minor
---

The server-safe entry no longer carries the interface's text. `pdfMessages` and `PdfMessageCatalogue`, from `@hussmartinez/pdf-sdk`, now hold only sdk-core's text and the SDK's error and warning text. The text of the editor, its toolbar and tools, the viewer and the thumbnails is in `pdfEditorMessages`, from `@hussmartinez/pdf-sdk/react`, which also holds the error, warning and ui text.

This makes the server-safe entry about 0.36 kB smaller (brotli), and keeps it from growing as the editor gains tools.

`PdfSessionProvider` and `usePdfMessages()` now use `pdfEditorMessages`, as `PdfEditor` already did. Their `messages` overrides are typed with `PdfEditorMessageCatalogue`. The keys and their English text are unchanged, so overrides keep working at runtime.

**Migrating:** if you typed overrides of interface keys with `PdfMessageCatalogue`, type them with `PdfEditorMessageCatalogue`:

```ts
// Before
import type { PdfMessageCatalogue } from "@hussmartinez/pdf-sdk";
const messages: MessageOverrides<PdfMessageCatalogue> = { "editor.start.choose": "Elegir un PDF" };

// After
import type { PdfEditorMessageCatalogue } from "@hussmartinez/pdf-sdk/react";
const messages: MessageOverrides<PdfEditorMessageCatalogue> = { "editor.start.choose": "Elegir un PDF" };
```

Overrides of `errors.*` and `warnings.*` keys typed with `PdfMessageCatalogue` need no change. Neither does `createMessages(pdfMessages)` for showing the session's errors without the React components.
