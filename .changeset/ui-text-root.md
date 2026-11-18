---
"@hussmartinez/pdf-sdk": patch
---

`PdfEditor` now takes its text style from ui's `hm-text` class on its root (ui ADR 0010), instead of font rules of its own. It looks the same: ui's font family, body size and line height, now with ui's regular weight and letter spacing too.

- An `unstyled` editor doesn't get the class, and its text stays the host's.
- `--hm-pdf-editor-text` still sets the editor's text colour.

It now depends on `@hussmartinez/ui` `^0.11.0`, which brings `hm-text`. If your app also depends on `@hussmartinez/ui` directly, move it to 0.11, so your app keeps one copy (sdk-core ADR 0047). Its sdk-core range is unchanged.

`pdfEditorMessages` includes ui's catalogue, so it gains ui 0.11's two new messages, `colorField.swatches` and `reorderableList.moved`. The editor doesn't show them yet, but you can override them through `messages` like any other.
