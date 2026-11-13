---
"@hussmartinez/pdf-sdk": minor
---

Requires `@hussmartinez/ui` `^0.5.0`. If your application uses ui itself, move it to `^0.5.0` too, and check that `npm ls @hussmartinez/ui` lists one version.

`PdfEditor`'s `messages` prop now also translates ui's text inside the editor, such as `"spinner.label"`. The editor builds one set of text from your `locale` and overrides, for its own components and for ui's. Before, ui's text inside the editor followed your locale but ignored your overrides. The prop is typed with the new `PdfEditorMessageCatalogue`, and `pdfEditorMessages`, exported from `@hussmartinez/pdf-sdk/react`, is the English catalogue it overrides. `pdfMessages` from the headless entry is unchanged and doesn't include ui's text.

Shortcut labels come from ui's `usePlatform()`: `Control` on the server and during hydration, then `Meta` (⌘) on Apple devices, as before.
