# 0009. Saving the document: the file's name, and the download tool

- **Status:** Accepted
- **Date:** 2026-11-17
- **Builds on:** [ADR 0003](0003-page-plan-document-model.md) (bytes are built on export); in sdk-core, [ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md) (hostile input and no network), [ADR 0014](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0014-accessibility-and-translatable-text.md) (accessibility) and [ADR 0018](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0018-worker-rpc-protocol.md) (worker calls and cancelling)

## Context

`PdfEditor` can build the edited document through `handle.export()`, but it has no control to save it. The pdf-editor app adds its own Download button and has to name the file itself, though the editor never tells it the opened file's name.

Two things need deciding:
- **The file's name:** where it comes from, how the SDK exposes it, and how it stays safe. A file name is chosen by whoever made the file, so it's hostile input like the bytes. It can hold:
  - path separators;
  - control characters;
  - right-to-left overrides that disguise an extension;
  - characters some systems refuse;
  - thousands of characters.
- **The download tool:** what it does, how a host replaces the browser download with its own handling, and how it behaves while a large document builds in the worker, when that fails, and when the user cancels.

## Decision

### The opened file's name

- `PdfSourceInfo` gains an optional `name`. It comes from `File.name` when the `Blob` given to `open()` or `insert()` is a `File`. `open()` takes new `PdfOpenOptions`, which extend `PdfCallOptions`, and `PdfInsertOptions` gains the same optional `name`, for hosts that pass bytes or a plain `Blob`. A given `name` wins over `File.name`. Otherwise there's no name.
- `PdfEditorChange` gains an optional `fileName` on `"open"` changes: the name of the document that was opened. An insert doesn't change it.
- **The name is cleaned once, when the source is registered,** and only the clean name is ever stored or exposed:
  1. Normalise to NFC.
  2. Remove control characters (Unicode category Cc, which covers C0, DEL and C1) and the bidirectional formatting characters U+061C, U+200E, U+200F, U+202A–U+202E and U+2066–U+2069.
  3. Keep only the last segment after a `/` or `\`, so no path survives.
  4. Remove the characters Windows refuses in file names: `< > : " | ? *`.
  5. Trim whitespace and leading dots, so a name can't become hidden or empty-looking.
  6. Cap it at 128 code points, never splitting a surrogate pair. The cap counts code points, not UTF-16 units.
  7. If nothing is left, there's no name.
- **Where the name may go:** it's only ever text content set through React, or a download's file name. It is never HTML, never an attribute that's parsed (`href`, `src`, `style`), and never part of a URL.
- **It never reaches `onEvent`:** usage events carry no file names or contents (sdk-core ADR 0012). A test opens and inserts files with distinctive names, and asserts that no event contains them.

### The download tool

`pdf.download` is a tool in a new `save` group, at the end of the toolbar by default, with ui's `DownloadIcon`. It has no shortcut: saving is a deliberate click or key press on the button. The browser's own Ctrl or ⌘+S stays the browser's.

**When it runs:**
1. The tool calls `session.export()` with an `AbortSignal`. The plan is read when the call starts, so edits made while it builds don't change the file.
2. With the bytes, it does one of two things:
   - **By default,** it saves them through the browser: it creates a `Blob` of type `application/pdf` and a `blob:` URL, clicks an `<a download>` that isn't attached to the document, and revokes the URL once the click has been dispatched. That makes no request and needs no Content Security Policy change: `blob:` downloads aren't governed by `connect-src` or `worker-src`.
   - **If the host passes `onExport(bytes, info)`,** the editor calls it instead and doesn't download. The host may store the bytes, upload them with its own code, or save them some other way. `info` holds the download name and the page count.
3. The download name defaults to the source's clean name, or `"document.pdf"` when there's none. `.pdf` is added unless the name already ends with it, in any case. A host's `downloadName(info)` prop can return another name. That result is cleaned the same way, and replaced by `"document.pdf"` if nothing is left.

**While it runs:**
- **Busy state:** the button is disabled with ui's `focusableWhenDisabled`, so it can't run twice but keeps focus, and the editor root is `aria-busy`. A status region in the header says "Preparing the PDF…".
- **Cancelling:** after a second, a Cancel button appears beside that status, so a quick export doesn't flash it. Tab reaches it from the toolbar, and pressing it aborts the signal. Escape isn't used, because it already means "keep only the focused page" in the thumbnails. Cancelling the call cancels the worker's job (sdk-core ADR 0018) and ends quietly: an `ABORTED` error shows no alert, and nothing is saved.
- **Opening or closing a document** also cancels a running export.
- **Other tools:** the other tools stay usable during an export, because it builds from the plan as it was when it started.

**When it ends:**
- **Success:** announces "Saved report.pdf." or "The PDF is ready." when `onExport` handles it, and focus stays on the button.
- **The export fails:** for example `PROCESSING_FAILED` or a time limit. The header's alert shows the error's text from the catalogue by its code, nothing is saved, `onExport` isn't called, and focus returns to the button.
- **The host's `onExport` throws or rejects:** the editor shows "The PDF couldn't be saved. Please try again." from the catalogue, and doesn't look inside the host's error, whose logging belongs to the host. The busy state ends in every case.

### No export dialog, yet

image-sdk's export opens a dialog of choices and a summary. A PDF export has no choices in the editor yet, so a dialog would be one more click for nothing. When the editor offers choices, such as compression or a password, the tool opens a dialog with a summary, as image-sdk's does, and this record is superseded.

## Alternatives considered

- **The File System Access API (`showSaveFilePicker`):** it lets users pick a place and overwrite a file, but only Chromium has it. A host that wants it can use `onExport`.
- **Keeping the raw name and cleaning it where it's used:** every use would have to remember to. One clean value, made once, can't be misused later.
- **Putting the file name in usage events:** it would tell analytics what users open, which ADR 0012 rules out.
- **Leaving downloads to hosts, through the handle:** every host would rebuild the same button, busy state, cancelling and error text, and most would skip some of it.
- **A shortcut for saving:** Ctrl or ⌘+S is the browser's "Save page" and users expect it. Taking it in a component inside a page is surprising.

## Consequences

- Hosts get the file's name, safe to show, for titles and download names. They lose nothing by passing bytes, because `name` can be given with them.
- The editor saves documents without the host's help, under the same Content Security Policy as today.
- `onExport` makes the editor usable in apps that save elsewhere, such as an app's own storage, without a second button.
- New catalogue strings: "Preparing the PDF…", "Cancel", the saved and ready announcements, and the save failure. The screenshot tests gain the save failure's alert. The exporting state is covered by browser tests with a held processor, because the example page can't hold an export in progress.
