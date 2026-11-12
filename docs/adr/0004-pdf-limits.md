# 0004. PDF limits and session memory

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

[ADR 0020](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0020-file-policy.md) gives every SDK the core limits, `maxFileSize`, `maxFiles`, `maxDecodedSize` and `maxProcessingTime`, and asks each SDK to add the limits specific to its kind with `defineLimits`. PDFs have their own ways to exhaust a device:

- **Page counts:** a small file can declare tens of thousands of pages. Each one costs memory for thumbnails, page keys and layout.
- **Images:** a single image can declare dimensions that decode to gigabytes. JBIG2 and JPX compress extremely well, so the file stays small.
- **Canvas size:** browsers refuse canvases above a maximum area. iOS Safari's is 16,777,216 pixels (4096 × 4096). A page rendered past it draws nothing, or crashes the tab.
- **The session:** with the page plan ([ADR 0003](0003-page-plan-document-model.md)), every inserted document stays in memory while the plan or the undo history refers to it. Ten merged 80 MB files are each within `maxFileSize`, but they add up to 800 MB.

The original PDF editor warned at 100 MB and rejected files over 300 MB, and had no other limits.

## Decision

### The limits

`pdfLimits` is `coreLimits` plus three PDF limits, defined with `defineLimits` so that violations throw `PdfError`:

| Limit | Code | Default maximum | Default warning | Checked |
|---|---|---|---|---|
| `maxFileSize` (core) | `FILE_TOO_LARGE` | 100 MB | 50 MB | Each file, before it's read |
| `maxFiles` (core) | `TOO_MANY_FILES` | 20 | none | The sources in a session, on each insert |
| `maxDecodedSize` (core) | `DECODED_SIZE_TOO_LARGE` | 500 MB | none | Streams the SDK decodes itself, such as images it recompresses |
| `maxProcessingTime` (core) | `PROCESSING_TIME_EXCEEDED` | 120 s | none | Each open, render and export |
| `maxPages` | `TOO_MANY_PAGES` | 5,000 | 1,000 | Each source as soon as the engine reads its page count, and the plan on each insert |
| `maxSessionSize` | `SESSION_TOO_LARGE` | 300 MB | 150 MB | The bytes of every source the session holds, on each open and insert |
| `maxImagePixels` | `IMAGE_TOO_LARGE` | 100 MP | none | Every image pdf.js decodes (`maxImageSize`) and every image the compressor considers |

The core defaults stay as they are. Hosts that want the original editor's 300 MB per file set `filePolicy: { maxFileSize: { maximum: 300e6, warning: 100e6 }, maxSessionSize: … }`.

### How each limit behaves

- **A failed check is specific.** `TOO_MANY_PAGES` and `SESSION_TOO_LARGE` fail the open or insert with `details` naming the limit, its maximum and the actual value, before any rendering starts. The session's current document stays as it was.
- **Images over `maxImagePixels` are skipped, not fatal.** pdf.js leaves them unpainted, and the compressor leaves their bytes untouched. The session reports one `IMAGE_TOO_LARGE` warning per document, so the viewer can say that some images aren't shown. A document is still usable when one of its images is hostile.
- **The canvas is a rendering cap, not a limit.** The viewer lowers a page's resolution so that no canvas exceeds 16,777,216 pixels. This isn't configurable through `filePolicy`, because exceeding it never helps and only breaks the page.
- **Decoding inside the engines:** qpdf and pdf.js decompress streams internally, where `maxDecodedSize` can't be fed chunk by chunk. There, `maxProcessingTime` and terminating the worker are the backstop, and an out-of-memory failure in a worker is reported as `WORKER_CRASHED`. The SDK feeds `createDecodedSizeBudget` wherever its own code decodes, such as image recompression.

### Session memory

- **`maxSessionSize` counts every source the session holds,** whether the plan or the undo history refers to it. Deleting an inserted document's pages doesn't free it while undo could bring them back.
- **Warnings are part of the snapshot.** At the warning threshold, the snapshot carries a `maxSessionSize` warning, and the editor says that the session is large and that discarding undo history frees memory.
- **The history gives way first.** When an insert would exceed the maximum, the session first drops the oldest history entries that are the only references to a source, and frees those sources. Only if that isn't enough does the insert fail with `SESSION_TOO_LARGE`. The editor shows when early steps are no longer undoable ([ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md)).

### Text

Each code has text under `errors.<CODE>`, and each warning under `warnings.<limit>`, in `src/messages/en.ts` ([ADR 0019](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0019-message-catalogues.md)). A type check fails if any limit's code or warning is missing.

## Alternatives considered

- **Only the core limits:** a small file with 50,000 pages, or an image declaring 100,000 × 100,000 pixels, would pass every check.
- **`maxImagePixels` failing the whole document:** one hostile image would make an otherwise good document unusable.
- **The canvas cap as a configurable limit:** raising it only produces blank pages or crashes on the devices that enforce it.
- **Counting only the sources the plan uses:** undo would silently keep hundreds of megabytes alive.
- **Higher defaults, such as the original 300 MB per file:** the core defaults are deliberately safe for phones, and hosts that serve desktops raise them in one line.

## Consequences

- A hostile PDF can't freeze or crash the page through its page count, its images or the canvas, and a large session warns before it fails.
- Hosts configure PDF limits the same way as every other SDK's, and misspelt limits fail loudly.
- Some legitimate documents hit a limit. The error names the limit, and the host can raise it.
- The session has to track which sources the plan and the history refer to. The session's tests cover dropping history to make room.
