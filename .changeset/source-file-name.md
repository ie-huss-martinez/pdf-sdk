---
"@hussmartinez/pdf-sdk": minor
---

The opened file's name is now available, so you can show it or name a download after it:

- `PdfSourceInfo.name`: each source in `session.getSnapshot().sources` has the name of the `File` it came from.
- `PdfEditorChange.fileName`: `onChange` reports it on `"open"`.
- A new `name` option on `session.open()` (`PdfOpenOptions`), `session.insert()` and `PdfEditorHandle.open()` names bytes or a plain `Blob`. It wins over `File.name`.

The name is cleaned before it's kept. It's the last path segment only, without control or bidirectional formatting characters or characters Windows refuses, trimmed, and at most 128 code points. If nothing is left, there's no name. It comes from the file, so show it as text only, never as HTML. It never appears in `onEvent` usage events.
