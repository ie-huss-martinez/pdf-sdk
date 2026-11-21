# @hussmartinez/pdf-sdk

## 0.5.0

### Minor Changes

- [#78](https://github.com/ie-huss-martinez/pdf-sdk/pull/78) [`97e33c5`](https://github.com/ie-huss-martinez/pdf-sdk/commit/97e33c59db932e60124b699feee346298294353e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - A build that self-hosts the SDK's assets can now leave the inlined workers out. Set the `hm-self-hosted` resolve condition in your bundler, for example `resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] }` in Vite, and the inlined render and processing workers, their WebAssembly decoders and pdf.js's inlined data files resolve to a small stub instead, saving about 5 MB of chunks your app never loaded. With the condition set, every engine and processor needs `assetsUrl`; a worker started without it fails with `WORKER_START_FAILED`, whose `details` are `{ condition: "hm-self-hosted", missing: "assetsUrl" }`. Without the condition nothing changes. The README shows the Vite and esbuild settings.

## 0.4.5

### Patch Changes

- [#74](https://github.com/ie-huss-martinez/pdf-sdk/pull/74) [`9753014`](https://github.com/ie-huss-martinez/pdf-sdk/commit/975301488b7787b668b5039129a9490bebce01a7) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Applications that import only part of `@hussmartinez/pdf-sdk/react` ship about 0.9 kB less (brotli), for example only `pdfEditorMessages`, `PdfViewer` or `PdfThumbnails`. Before, a call in the move tools' definitions stopped bundlers that can't prove it has no effects, such as esbuild, from dropping the editor's tools: every tool went into every such bundle. Nothing changes in the API or in what the editor does.

## 0.4.4

### Patch Changes

- [#70](https://github.com/ie-huss-martinez/pdf-sdk/pull/70) [`529f203`](https://github.com/ie-huss-martinez/pdf-sdk/commit/529f20378ab68730d983ec7128ff122daad2017a) Thanks [@hussmartinez](https://github.com/hussmartinez)! - pdf-sdk now cleans file names with `cleanFileName` from `@hussmartinez/sdk-core` (sdk-core ADR 0051), instead of a copy of its own, and depends on `@hussmartinez/sdk-core` `^0.4.7`. The rules are the same, with one addition: an unpaired surrogate is removed. That affects a `name` passed to `session.open()`, `session.insert()` or `PdfEditorHandle.open()`, and a host's `downloadName`. Such a string isn't well-formed Unicode, and `encodeURIComponent` throws on it. A `File`'s own name can't hold one, because the browser already replaces it.
  
  If your app also depends on `@hussmartinez/sdk-core` directly, move it to 0.4.7 too, so your app keeps one copy (sdk-core ADR 0047).

## 0.4.3

### Patch Changes

- [#67](https://github.com/ie-huss-martinez/pdf-sdk/pull/67) [`3356fbf`](https://github.com/ie-huss-martinez/pdf-sdk/commit/3356fbf9f6ec99ab8d7ff24576d7decd6ac47241) Thanks [@hussmartinez](https://github.com/hussmartinez)! - pdf-sdk now depends on `@hussmartinez/ui` `^0.15.0`, up from `^0.11.0`, so it shares one ui version with the other SDKs' editors. Its `@hussmartinez/sdk-core` range is unchanged.
  
  Nothing changes in pdf-sdk's API or appearance. Two ui changes reach the editor:
  
  - Screen readers now hear messages announced in the same frame together, instead of only the last one. All the editor's announcements end with a full stop, so joined messages read as sentences.
  - In right-to-left text, the undo and redo icons now mirror whatever builds your CSS. They follow the nearest `dir` attribute; before, Vite and Next.js builds could lose the `:dir(rtl)` rule they used.
  
  If your app also depends on `@hussmartinez/ui` directly, move it to 0.15 too, so your app keeps one copy (sdk-core ADR 0047).

## 0.4.2

### Patch Changes

- [#64](https://github.com/ie-huss-martinez/pdf-sdk/pull/64) [`2b2052b`](https://github.com/ie-huss-martinez/pdf-sdk/commit/2b2052babe0ea88c4a11a2eefdf6f9bfef2caede) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfViewer` and `PdfThumbnails` no longer flicker when their content only just overflows, with scrollbars that take space: on Windows, or with "always show scrollbars" on macOS or Linux. Before, at certain heights, a scrollbar appeared, the pages narrowed and fit, the scrollbar went, and the pages widened again, every frame.
  
  Pages and thumbnails are now sized as if the scrollbar were always shown, using its measured width. Overlay scrollbars take no space, so nothing changes with them.

## 0.4.1

### Patch Changes

- [#62](https://github.com/ie-huss-martinez/pdf-sdk/pull/62) [`3e411d0`](https://github.com/ie-huss-martinez/pdf-sdk/commit/3e411d09b992a3f737a51e45726ea91d6e44b9ba) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` now takes its text style from ui's `hm-text` class on its root (ui ADR 0010), instead of font rules of its own. It looks the same: ui's font family, body size and line height, now with ui's regular weight and letter spacing too.
  
  - An `unstyled` editor doesn't get the class, and its text stays the host's.
  - `--hm-pdf-editor-text` still sets the editor's text colour.
  
  It now depends on `@hussmartinez/ui` `^0.11.0`, which brings `hm-text`. If your app also depends on `@hussmartinez/ui` directly, move it to 0.11, so your app keeps one copy (sdk-core ADR 0047). Its sdk-core range is unchanged.
  
  `pdfEditorMessages` includes ui's catalogue, so it gains ui 0.11's two new messages, `colorField.swatches` and `reorderableList.moved`. The editor doesn't show them yet, but you can override them through `messages` like any other.

## 0.4.0

### Minor Changes

- [#58](https://github.com/ie-huss-martinez/pdf-sdk/pull/58) [`a63f7c1`](https://github.com/ie-huss-martinez/pdf-sdk/commit/a63f7c147552b254aee66334bec7ef643c847cec) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` can delete pages. The new `pdf.delete-pages` tool, in `pdfTools` and in the toolbar's Pages group with ui's delete icon, works like this:
  
  - It deletes the selected pages, or the current page, as one undoable step.
  - A document keeps at least one page, so the tool is disabled when every page would go.
  - In the thumbnails, Delete or Backspace runs it. Those keys do nothing elsewhere in the editor.
  - It announces "Deleted 2 pages.".
  - The page that takes the first deleted page's place becomes the selection and the current page. Focus moves to its thumbnail if the deleted one had focus.
  
  To leave deleting out, omit `pdf.delete-pages` from `tools`.
  
  Other changes:
  
  - **Undo and redo restore view state:** they now bring back the selection and current page that went with each step, not only the pages. Undoing a delete selects the restored pages again.
  - **Disabled toolbar buttons keep focus:** they now use `aria-disabled` instead of the `disabled` attribute, so keyboard users stay in the toolbar. Tests that read `button.disabled`, or use jest-dom's `toBeDisabled()`, should check `aria-disabled="true"` instead. Playwright's `toBeDisabled()` already understands `aria-disabled`.
  - **`PdfThumbnails` has an `onDelete` prop:** used on its own, it runs `onDelete` on Delete and Backspace.

- [#59](https://github.com/ie-huss-martinez/pdf-sdk/pull/59) [`5259cd4`](https://github.com/ie-huss-martinez/pdf-sdk/commit/5259cd49931a085acefaff5a3c6135ad277e2f50) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` can save the document. The new `pdf.download` tool, in `pdfTools` and in a new Save group at the end of the toolbar with ui's download icon, works like this:
  
  - It builds the document in the worker and downloads it, named after the opened file, or `document.pdf`.
  - The download uses a `blob:` URL: no request, and no change to your Content Security Policy.
  - It has no shortcut, so Ctrl or ⌘+S stays the browser's.
  
  New props:
  
  - **`downloadName(info)`** names the file. `info` is `PdfDownloadNameInfo`: `sourceName` and `pageCount`. The result is cleaned as a file name, and `.pdf` is added if it's missing.
  - **`onExport(bytes, info)`** receives the bytes instead of the browser downloading them. `info` is `PdfExportInfo`: `fileName` and `pageCount`. If it throws or rejects, the editor shows "The PDF couldn't be saved. Please try again." Your error is yours to log.
  
  While a save runs:
  
  - The button is disabled but keeps focus.
  - The editor is `aria-busy`, and the header says "Preparing the PDF…".
  - After a second, a Cancel button appears. Cancelling, or opening or closing a document, stops the save quietly.
  - A failed build shows its error's text in the header's alert.
  
  For your own tools, `PdfToolState` gains `saving` and `PdfToolContext` gains `save()`. Both are optional and absent outside the editor. `PdfToolbar` gains a `saving` prop.
  
  If your app has its own Download button that calls `handle.export()`, you can remove it, or keep it and leave `pdf.download` out of `tools`.

- [#57](https://github.com/ie-huss-martinez/pdf-sdk/pull/57) [`48110a3`](https://github.com/ie-huss-martinez/pdf-sdk/commit/48110a38ec03648623255ee4abbb6ff817622a65) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The server-safe entry no longer carries the interface's text. `pdfMessages` and `PdfMessageCatalogue`, from `@hussmartinez/pdf-sdk`, now hold only sdk-core's text and the SDK's error and warning text. The text of the editor, its toolbar and tools, the viewer and the thumbnails is in `pdfEditorMessages`, from `@hussmartinez/pdf-sdk/react`, which also holds the error, warning and ui text.
  
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

- [#60](https://github.com/ie-huss-martinez/pdf-sdk/pull/60) [`1e9a75e`](https://github.com/ie-huss-martinez/pdf-sdk/commit/1e9a75e9ab7e0738e35b2a6a806512825a8cbac6) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` can merge PDFs. The new `pdf.insert-pages` tool, in `pdfTools` and in the toolbar's File group with ui's page-add icon, works like this:
  
  - It asks for another PDF and inserts all its pages after the current page, as one undoable step.
  - The inserted pages become the selection, the first one comes into view, and the insert is announced, for example "Inserted 2 pages after page 1.".
  - The file policy applies to the combined document. `maxPages` counts the pages after the insert, and `maxSessionSize` counts every document the session holds.
  - A failed insert, such as a file that isn't a PDF or one over a limit, leaves the document unchanged and shows why in the header.
  - When the session had to drop the earliest undo steps to make room, the header says those edits can no longer be undone.
  
  For your own tools, `PdfToolState` gains `inserting` and `PdfToolContext` gains `chooseInsertFile()`. Both are optional and absent outside the editor. `PdfToolbar` gains an `inserting` prop.
  
  It now depends on `@hussmartinez/ui` `^0.8.0`, for that icon. If your app also depends on `@hussmartinez/ui` directly, move it to 0.8 too, so your app keeps one copy (sdk-core ADR 0047).

- [#61](https://github.com/ie-huss-martinez/pdf-sdk/pull/61) [`4a2ebd7`](https://github.com/ie-huss-martinez/pdf-sdk/commit/4a2ebd78e8795da6a7141ca4a2c7e2650d474d84) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` can reorder pages. The new `pdf.move-earlier` and `pdf.move-later` tools, in `pdfTools` and in the toolbar's Pages group with ui's move-up and move-down icons, work like this:
  
  - They move the selected pages, or the current one, one position earlier or later, as one undoable step each.
  - Pages that aren't next to each other are gathered into one block, in their order.
  - The moved pages stay selected and focused, and the move is announced, for example "Moved 2 pages to position 4.".
  - A tool is disabled when its block is already at that end.
  
  In the thumbnails, Alt+↑ and Alt+↓ (Option on macOS) run them. They do nothing elsewhere in the editor, and nothing with other modifiers. These keys don't clash with browser or system shortcuts; ADR 0008 records the check.
  
  `PdfThumbnails` used on its own takes an `onMove(direction)` prop for those keys. If a moved or removed thumbnail had focus, focus now stays in the list.

- [#56](https://github.com/ie-huss-martinez/pdf-sdk/pull/56) [`c69a7c2`](https://github.com/ie-huss-martinez/pdf-sdk/commit/c69a7c2641fb543c1fbe17f2176f282ba25aecbb) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The opened file's name is now available, so you can show it or name a download after it:
  
  - `PdfSourceInfo.name`: each source in `session.getSnapshot().sources` has the name of the `File` it came from.
  - `PdfEditorChange.fileName`: `onChange` reports it on `"open"`.
  - A new `name` option on `session.open()` (`PdfOpenOptions`), `session.insert()` and `PdfEditorHandle.open()` names bytes or a plain `Blob`. It wins over `File.name`.
  
  The name is cleaned before it's kept. It's the last path segment only, without control or bidirectional formatting characters or characters Windows refuses, trimmed, and at most 128 code points. If nothing is left, there's no name. It comes from the file, so show it as text only, never as HTML. It never appears in `onEvent` usage events.

### Patch Changes

- [#53](https://github.com/ie-huss-martinez/pdf-sdk/pull/53) [`d0c7596`](https://github.com/ie-huss-martinez/pdf-sdk/commit/d0c759609565850bac07f9fbd6334e67159fe563) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` now sets its own text in ui's type: `--hm-font-family`, `--hm-font-size-body` and `--hm-line-height-body`. The start area, the alerts and the page numbers no longer inherit the host page's font, which was often the browser's default serif. A host's unlayered CSS still overrides these, and `unstyled` editors keep inheriting them.

## 0.3.0

### Minor Changes

- [#44](https://github.com/ie-huss-martinez/pdf-sdk/pull/44) [`c9614c5`](https://github.com/ie-huss-martinez/pdf-sdk/commit/c9614c5b4284ef17c6491b43f7a65e06158fbe72) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Edit commands are now checked strictly, and refused with a stable code and reason (sdk-core ADR 0045).
  
  **Breaking:** `session.execute`, `undo` and `redo` throw `PdfError` with the new code `INVALID_COMMAND` for a command that doesn't fit the plan, instead of `TypeError` or `RangeError`. `details.reason` says why, as one of the `PdfCommandRejection` tokens, such as `unknown-page`, `last-page`, `invalid-position` or `invalid-color`. The session still changes nothing when a command is refused. To migrate, replace `instanceof TypeError` or `RangeError` checks with `isPdfError(error, "INVALID_COMMAND")`, and branch on `error.details.reason` instead of the message. `pdfMessages` has text for the new code.
  
  Commands are also stricter:
  
  - A field a command's type doesn't have, or a field of the wrong type, is refused as `malformed-command`.
  - Annotation positions, stroke widths and text sizes are snapped to millionths of the page (`PDF_POSITION_GRID`), so the session only stores values on that grid. Positions outside 0 to 1 are refused.
  - Colours must be `#rrggbb` in lowercase.
  - Lengths are counted in Unicode code points: ids and page keys have 1 to `PDF_MAX_ID_LENGTH` (128), field names up to `PDF_MAX_FIELD_NAME_LENGTH` (1,000), and text notes and text field values up to `PDF_MAX_TEXT_LENGTH` (10,000). Strokes have up to `PDF_MAX_STROKE_POINTS` (10,000) points.
  - `pdf.insertPages` and `pdf.setFieldValue` refuse a source the session doesn't hold, and `pdf.insertPages` refuses a page index the source doesn't have.
  - Signature annotations (`type: "signature"`) are refused with `unsupported-annotation` until the editor's signature tool lands. If you add them yourself today, keep them outside the session until then.
  
  A form field named `__proto__` is now stored like any other field. Before, setting it changed the values object's prototype instead.

- [#45](https://github.com/ie-huss-martinez/pdf-sdk/pull/45) [`c0c8454`](https://github.com/ie-huss-martinez/pdf-sdk/commit/c0c84548c22dae4da0e415229a5b26aa700da25e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Plans and edit commands have a portable JSON format, `hm-pdf-plan` and `hm-pdf-command` version 1 (sdk-core ADR 0045), so a project can be saved and opened again, here or by a port of the SDK in another language.
  
  - `toPdfPlanDocument(plan, sources)` writes a plan, with each source's page count, and `readPdfPlanDocument(json)` reads one back as `{ plan, sources }`. Documents hold positions and sizes as whole millionths of the page, and no PDF bytes or file names.
  - `toPdfCommandDocument(command)` and `readPdfCommandDocument(json)` do the same for a command.
  - A document of another format, or a later version, is refused with the new code `UNSUPPORTED_FORMAT`, and any other invalid document with the new code `INVALID_DOCUMENT`. Both have a `details.reason` from `PdfDocumentRejection`, and text in `pdfMessages`.
  - `pdf.rotatePages` now takes an `angle` from -360 to 360. A larger one is refused with `INVALID_COMMAND` and `invalid-rotation`, as the format's schema refuses it.
  
  `docs/formats/hm-pdf-plan.md` describes the formats. Their JSON Schemas are in `formats/`, and the conformance vectors in `conformance/`.

### Patch Changes

- [#40](https://github.com/ie-huss-martinez/pdf-sdk/pull/40) [`18283c5`](https://github.com/ie-huss-martinez/pdf-sdk/commit/18283c5fa2e993cac9021af09d98f295b9ce55e9) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `createPdfJsEngine` and `createPdfProcessor` now accept an `assetsUrl` relative to the page, such as `"/pdf-sdk/"`, when you call them on a server. They resolve it when their worker first starts, in the browser, as `PdfEditor` and `PdfSessionProvider` already did. Before, they threw `TypeError` there. A URL with a query or a fragment still throws `TypeError` at once.

- [#43](https://github.com/ie-huss-martinez/pdf-sdk/pull/43) [`eea6a0b`](https://github.com/ie-huss-martinez/pdf-sdk/commit/eea6a0bf1539428201b1b18f7a0b0911e1501726) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The session's snapshot store and undo history now come from `@hussmartinez/sdk-core`, shared with the other SDKs. Editing, undo, redo and memory trimming behave as before. One difference for code that calls `session.subscribe` directly: a listener that throws no longer stops the other listeners, or the edit that notified them. Its error is reported with `reportError` instead.

- [#48](https://github.com/ie-huss-martinez/pdf-sdk/pull/48) [`fd86a81`](https://github.com/ie-huss-martinez/pdf-sdk/commit/fd86a8167432946e3f4fe8d419b21c9fb26fb193) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The JSON Schemas of the portable formats now ship with the package, so you can validate documents against the version that matches your installed reader, such as on a server that stores them: `@hussmartinez/pdf-sdk/formats/hm-pdf-plan/v1.schema.json` and `@hussmartinez/pdf-sdk/formats/hm-pdf-command/v1.schema.json`. `docs/formats/hm-pdf-plan.md` shows how to load them with Ajv.

- [#47](https://github.com/ie-huss-martinez/pdf-sdk/pull/47) [`b04102a`](https://github.com/ie-huss-martinez/pdf-sdk/commit/b04102acc682b32e9b92846136b59d1f06d9857c) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfViewer` no longer snaps back to where it was when you scroll just as page sizes change, such as while pages are still being measured after opening a document or jumping to a page. It used to restore its previous position over your scroll, and keep the page you scrolled away from as the current one.

## 0.2.0

### Minor Changes

- [#35](https://github.com/ie-huss-martinez/pdf-sdk/pull/35) [`c81403b`](https://github.com/ie-huss-martinez/pdf-sdk/commit/c81403b0b50607a6ee1c8cb733276d3285c35d93) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Requires `@hussmartinez/ui` `^0.5.0`. If your application uses ui itself, move it to `^0.5.0` too, and check that `npm ls @hussmartinez/ui` lists one version.
  
  `PdfEditor`'s `messages` prop now also translates ui's text inside the editor, such as `"spinner.label"`. The editor builds one set of text from your `locale` and overrides, for its own components and for ui's. Before, ui's text inside the editor followed your locale but ignored your overrides. The prop is typed with the new `PdfEditorMessageCatalogue`, and `pdfEditorMessages`, exported from `@hussmartinez/pdf-sdk/react`, is the English catalogue it overrides. `pdfMessages` from the headless entry is unchanged and doesn't include ui's text.
  
  Shortcut labels come from ui's `usePlatform()`: `Control` on the server and during hydration, then `Meta` (⌘) on Apple devices, as before.

- [#29](https://github.com/ie-huss-martinez/pdf-sdk/pull/29) [`f849bda`](https://github.com/ie-huss-martinez/pdf-sdk/commit/f849bdab5dc0fb70887abdf79271ce56f5355a88) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `PdfEditor` has a toolbar, built from `@hussmartinez/ui` 0.3's components, and keyboard shortcuts.
  
  - **Tools:** open a PDF, undo, redo, and rotate the selected pages, or the current one, left or right. `pdfTools` lists them; choose which are present with the new `tools` prop, such as `tools={["pdf.undo", "pdf.redo"]}`, and arrange the toolbar with `toolbar`, as groups of tool ids. `toolbar={[]}` hides the toolbar and keeps the shortcuts. An unknown tool id throws when the editor renders. `icons` replaces any icon by name.
  - **Shortcuts:** `Ctrl+Z` and `Ctrl+Shift+Z` or `Ctrl+Y` (`⌘Z` and `⇧⌘Z` on Apple platforms) undo and redo, and `[` and `]` rotate. They work only while focus is inside the editor, never while typing in a field, and each toolbar button names its shortcut in `aria-keyshortcuts`.
  - **Announcements:** undoing, redoing and rotating are announced to screen readers, as opening and closing already were, through ui's announcer.
  - **Building blocks:** `PdfToolbar` renders a toolbar for your own layout, and `pdfIcons` is the icon set the tools use.
  - **Thumbnails:** a fix: thumbnails no longer shrink to the minimum target size when ui's stylesheet is loaded, and the sidebar is five control heights wide, so it follows ui's density.
  
  **`@hussmartinez/ui` is now a dependency, and its stylesheet is required.** Import `@hussmartinez/ui/styles.css` once, before `@hussmartinez/pdf-sdk/styles.css`: the toolbar's focus rings and target sizes are in it. If your application uses ui itself, depend on the same minor version, `^0.3.0`, and check that `npm ls @hussmartinez/ui` lists a single version. The headless `.` entry doesn't import ui or React.

### Patch Changes

- [#33](https://github.com/ie-huss-martinez/pdf-sdk/pull/33) [`b64b9f7`](https://github.com/ie-huss-martinez/pdf-sdk/commit/b64b9f7fe42e83c7153b6efbd75964829b5bc8b3) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Pages no longer flash blank while they redraw. When the viewer's or thumbnails' width changes, for example as a scrollbar appears or the window is resized, each page keeps showing its previous drawing until the new one is ready, and then switches to it at once.

- [#38](https://github.com/ie-huss-martinez/pdf-sdk/pull/38) [`e6fc0cd`](https://github.com/ie-huss-martinez/pdf-sdk/commit/e6fc0cdc9fa2dbb1d36f79a10c7c7895d3e516ba) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The SDK now depends on `@hussmartinez/sdk-core` `^0.4.4` and `@hussmartinez/ui` `^0.7.0`, and ui itself uses that sdk-core, so an application gets one copy of each. If your application depends on ui or sdk-core directly, move to the same minor versions and check that `npm ls @hussmartinez/ui @hussmartinez/sdk-core` lists one version of each. `PdfEditor` and `PdfSessionProvider` take their `messages` overrides as before.

- [#37](https://github.com/ie-huss-martinez/pdf-sdk/pull/37) [`988433d`](https://github.com/ie-huss-martinez/pdf-sdk/commit/988433d69078d32c2625b65808295dcc0d966be8) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Self-hosted assets left over from another version now fail clearly. If you upgrade without copying `dist/assets/` again, opening or exporting fails with `WORKER_START_FAILED`, and its `details`, `{ asset, expected, actual }`, name the file and both versions. Before, the processing worker from another version ran anyway, and pdf.js's worker from another version made every document fail to open with `PROCESSING_FAILED`, as if the file were at fault.
  
  `createPdfJsEngine` and `createPdfProcessor` check `assetsUrl` when you call them: a relative URL with no page to resolve it against, or a URL with a query or fragment, throws `TypeError` there instead of failing later. `PdfEditor` and `PdfSessionProvider` still render on a server with a relative `assetsUrl`, such as `"/pdf-sdk/"`, because they create their engine and processor only on first use, in the browser; a query or fragment throws `TypeError` as they render.

## 0.1.0

### Minor Changes

- [#11](https://github.com/ie-huss-martinez/pdf-sdk/pull/11) [`8d53b54`](https://github.com/ie-huss-martinez/pdf-sdk/commit/8d53b54851854d80a189eebfcd99e872d1f3e72e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - First release of `@hussmartinez/pdf-sdk`, a PDF SDK that works entirely in the browser: files are opened and processed on the user's device and never uploaded. This release provides the headless core and the React editor. Its toolbar and the `<hm-pdf-editor>` element arrive in later releases.
  
  - **Editing sessions:** `createPdfSession({ engine })` holds the document being edited as a plan of pages over the files you open and insert, so rotating, deleting, moving and inserting pages, filling form fields and adding annotations are instant, never rewrite the file, and can all be undone and redone. Edits are plain-data commands, such as `{ type: "pdf.rotatePages", pages, angle: 90 }`, and several can run as one undoable step. The session is a framework-agnostic store, with `getSnapshot()` and `subscribe()`, that reports anonymous usage events, checks every file against your file policy before reading it, and keeps the open document if another fails to open. `export()` builds the edited document with the processor you pass, or returns an unchanged one as it is. The session counts the memory of every document it holds, including those undo could bring back, against `maxSessionSize`: to make room for an insert it drops the oldest history first, and says so with `historyTrimmed`.
  - **React editor:** `PdfEditor`, from `@hussmartinez/pdf-sdk/react`, is the complete editor: the document's pages beside it as thumbnails, in a layout that gives the document the full width on narrow screens. With no document open, it offers a button to choose a PDF and a drop zone, and says the file never leaves the device; while a file opens it shows its progress, and if it can't open one it says why, by error code, and offers to choose another. Opening and closing are announced to screen readers, and focus moves to the document once it opens. Pass `file` to open a document, and a different one to replace it, or `null` to close it; `onChange` reports each `open`, `edit` and `close` with the page count. A ref gives a `PdfEditorHandle` with `open()`, `export()`, `undo()`, `redo()`, `close()` and the `session`. The editor takes the provider's props, `className`, `classNames` and `unstyled`, renders on the server, and fills the height you give it.
  - **React viewer:** from `@hussmartinez/pdf-sdk/react`, `PdfSessionProvider` creates a session, or takes yours, with your locale and text overrides; `usePdfSession()`, `usePdfDocument()` and `usePdfMessages()` read it; and `PdfViewer` shows its pages in a scrolling column that only reads and draws the pages near the viewport, a few at a time, from the moment it mounts, however many pages the document has. It keeps the reader's place, and lands on a requested page, while page sizes are still arriving, the same in every browser. Page text is selectable and read by screen readers. Links are real links, limited to `http`, `https` and `mailto` without credentials, open with `noopener noreferrer`, and are named with where they really go, such as "Link to example.com, opens in a new tab". The viewer is a focusable region for keyboard scrolling, renders on the server, and takes `className`, `classNames` and `unstyled`. `PdfThumbnails` shows the pages as a column of thumbnails, drawn only near its viewport, to choose and select pages with the keyboard or a pointer; the viewer scrolls to the chosen page, and the thumbnails follow the viewer. The session keeps this view state, `selection`, `currentPage` and `navigation`, with `select()`, `setCurrentPage()` and `goToPage()`, so other frameworks and the element share it. Import `@hussmartinez/ui/styles.css` and then `@hussmartinez/pdf-sdk/styles.css` once for the designed look; without ui's stylesheet the components keep their layout and lose only their looks.
  - **Viewing PDFs:** `createPdfJsEngine()` opens documents with pdf.js in a Web Worker, renders pages to a canvas at any scale and rotation, and reads each page's text, form fields and links. Only `http`, `https` and `mailto` links without credentials are reported; `javascript:`, every other scheme and URLs such as `https://bank.example@evil.example/` are dropped. `safeLinkUrl()` applies the same check to any URL, and `linkDestination()` says where one leads. It loads only when the first document opens, runs with scripting and XFA off, and makes no network requests. Scanned documents with JBIG2 or JPX images, and CJK text whose fonts aren't embedded, render correctly. The data they need is bundled and loaded only when a document needs it.
  - **Two asset modes:** by default everything is inlined, which needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'` in a Content Security Policy. Or serve the package's `dist/assets/` from your own origin and pass the same `assetsUrl` to `createPdfJsEngine` and `createPdfProcessor`, for policies without `blob:` workers and for accurate CMYK and ICC colour, which inline mode approximates. The self-hosted processing worker checks that its `qpdf.wasm` belongs to the same version.
  - **Building documents:** `createPdfProcessor()` builds a new PDF from pages of one or more documents, in any order, with added rotations, filled text fields and checkboxes, lossless compression and AES-256 encryption, all in one `build()` call. It runs qpdf, compiled to WebAssembly, and pdf-lib in a Web Worker that starts on the first build, reports progress, can be cancelled, and never makes network requests. Your bytes are copied, never detached, unless you pass `transfer: true`.
  - **Contracts for your own engines:** `PdfEngine` and `PdfProcessor` describe what the SDK needs from a PDF engine, so you can supply your own. `PdfBuildJob` describes a whole export in one request: pages from several documents in any order, with rotations, form values, annotations, compression and encryption.
  - **Errors:** every failure is a `PdfError` with a stable `code`, such as `INVALID_PDF`, `PASSWORD_REQUIRED` or `TOO_MANY_PAGES`, and structured `details`. `isPdfError(error, code)` checks one, across workers and copies of the package.
  - **Limits for untrusted files:** `pdfLimits` adds `maxPages`, `maxSessionSize` and `maxImagePixels` to the family's limits on file size, file count, decoded size and processing time. Set them with a `filePolicy`; a misspelt limit name throws instead of being ignored.
  - **Translatable text:** `pdfMessages` is the English catalogue for every error code and limit warning, for `createMessages` from `@hussmartinez/sdk-core`. Error text comes from the code and its details, never from the error's message.

### Patch Changes

- [#26](https://github.com/ie-huss-martinez/pdf-sdk/pull/26) [`494aa1a`](https://github.com/ie-huss-martinez/pdf-sdk/commit/494aa1aa833fd4c05741cbca487c32d4003c5f08) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Depends on `@hussmartinez/sdk-core` `^0.3.0`, the first release of it after 0.1.2 that's published with its built files. If your application also depends on sdk-core, use `^0.3.0` too, and avoid 0.1.3 and 0.2.0, which fail to import.
  
  `pdfMessages` now includes sdk-core's names for keys, such as `"keys.control": "Ctrl"` and `"keys.apple.meta": "⌘"`, which keyboard shortcut labels use. Override them like any other message to translate them.
