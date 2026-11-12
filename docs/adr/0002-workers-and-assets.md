# 0002. Two workers, and PDF assets without the network

- **Status:** Accepted; ICC colour and self-hosted data files superseded by [0006](0006-icc-colour-and-self-hosted-assets.md)
- **Date:** 2026-11-12

## Context

[ADR 0001](0001-pdf-engines.md) chooses pdf.js for viewing, and qpdf and pdf-lib for transforming. The family's rules decide how such work runs:

- untrusted bytes are parsed only in workers that can be terminated ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md));
- workers use `sdk-core`'s typed RPC, with copied inputs, cancellation, preserved error codes and managed lifetimes ([ADR 0011](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0011-worker-messaging-and-assets.md), [ADR 0018](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0018-worker-rpc-protocol.md));
- worker and WebAssembly assets are inlined by default, and hosts can serve them from their own origin through `assets`;
- the SDK makes no network requests.

pdf.js doesn't fit the RPC directly. Its display layer runs on the page and talks to its own worker with its own protocol, which can't be replaced. It also loads data files on demand, and by default it does so from URLs:

- **CMaps** for CJK fonts that aren't embedded: 169 files;
- **standard font data** for the 14 standard fonts when they aren't embedded: 816 KB;
- **an ICC profile** for CMYK colour: 20 KB, CC0;
- **WebAssembly decoders:** JBIG2 (41 KB gzip), OpenJPEG for JPX (82 KB) and qcms for ICC colour (35 KB). Scanned documents commonly use JBIG2 and JPX.

Without URLs for them, pdf.js 6 renders those documents wrongly. Worse, its decoders then fall back to `import()`ing a JavaScript decoder from a relative URL, which is a network request to the host's origin.

## Decision

### The render worker: pdf.js's own

- **One pdf.js worker per engine.** `createPdfJsEngine()` creates a `Worker` lazily, from the inlined worker or `assets.pdfjsWorkerUrl`, and wraps it in a `PDFWorker` with its `port`. Every document the engine opens shares it. `GlobalWorkerOptions` is never set, so pdf.js elsewhere on the page isn't affected.
- **It keeps pdf.js's protocol.** ADRs 0011 and 0018 govern the workers an SDK writes. pdf.js's worker is a third-party engine's internal channel, which can't be replaced. The adapter gives callers the same guarantees instead:
  - **inputs are copied** before pdf.js transfers them, unless the caller passes `transfer: true`;
  - **cancellation:** an aborted `open` destroys its loading task, and an aborted render cancels its render task. Both reject with `sdk-core`'s `ABORTED` or `TIMEOUT` codes, or with the abort reason when it's an `SdkError`, as [ADR 0020](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0020-file-policy.md) requires;
  - **time limits:** `open` and each render run under `withProcessingTime`. If pdf.js doesn't settle after a cancel, the engine terminates its worker, the documents on it fail with `WORKER_TERMINATED`, and the next `open` creates a new one;
  - **errors** become `PdfError` codes, and a worker `error` event fails pending work with `WORKER_CRASHED`.

  This is recorded here as an interpretation of the family ADRs. It's raised in `sdk-core`, so that its standards can say how SDKs treat a third-party engine's worker.
- **Rendering stays on the page.** pdf.js parses in its worker and draws on the page's canvas, which is how its text layer and fonts work. Canvas sizes are capped by the file policy.

### PDF assets: a provider, never a URL

- **pdf.js gets a `BinaryDataFactory` of ours,** and `useWorkerFetch: false`. Every CMap, standard font, ICC profile and WebAssembly decoder that a document needs is then requested from the page, by kind and file name, and answered from:
  - **inline mode (the default):** a lazily loaded chunk per file, imported only when a document needs it, so an ordinary PDF loads none of them;
  - **self-hosted mode:** `assets.pdfjsDataUrl`, a directory on the host's origin. The package ships the same files under `dist/assets/pdfjs/`.
- **The decoders always use WebAssembly.** pdf.js's JavaScript fallbacks (`*_nowasm_fallback.js`) are never bundled, because loading them is an `import()` from a URL. If WebAssembly is unavailable, opening a document that needs a decoder fails with `UNSUPPORTED_ENVIRONMENT` and `details.feature: "WebAssembly"`.
- **An unknown request fails closed.** A file name that isn't in the bundled set is rejected, so a crafted document can't make the provider read an arbitrary path.

### The processing worker: the family RPC

- **One worker module** exposes the `PdfProcessor` operations with `exposeWorker`. `createPdfProcessor()` reaches it with `createWorkerClient`, from the inlined worker or `assets.processingWorkerUrl`.
- **qpdf loads lazily, without `fetch`.** `exposeWorker` runs first. qpdf's WebAssembly is compiled on the first operation, from the inlined bytes or `assets.qpdfWasmUrl`, and passed to `pdfstudio` as `wasmModule`. pdf-lib loads with it.
- **Two clients.** One runs edits and exports in order. A second, separate client runs compression previews. Cancelling a slow preview terminates its worker; with separate clients, that doesn't fail a pending export as collateral ([ADR 0018](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0018-worker-rpc-protocol.md)).
- **Lifetimes:** the processing worker can be warmed up when a document opens, so the first edit doesn't wait for qpdf to compile. It stops after `sdk-core`'s idle timeout, and with its session.

### Content Security Policy

The README documents the directives for both modes:

| Mode | Directives |
|---|---|
| Inline (default) | `worker-src blob:`, `script-src 'wasm-unsafe-eval'` |
| Self-hosted | `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'` for the WebAssembly and data files |

WebAssembly needs `'wasm-unsafe-eval'` in both modes. Neither mode needs `'unsafe-eval'`.

### Tests

- The end-to-end suites fail on any request to another origin. Their fixtures include JBIG2 and JPX images, CJK text without embedded fonts, and a CMYK image, and they assert that **no request at all** is made in inline mode, not even to the test server, beyond the page and its scripts.
- The self-hosted mode runs the same fixtures with `assets` set and a CSP without `blob:`.

## Alternatives considered

- **Running pdf.js inside our own RPC worker,** with its display layer rendering to an `OffscreenCanvas`: one protocol everywhere, but pdf.js doesn't support it. Its text layer and font loading need the page.
- **Setting `cMapUrl`, `standardFontDataUrl` and `wasmUrl` to inlined `data:` or `blob:` URLs:** pdf.js would still build paths by string concatenation, and a missing file falls back to `import()`. A provider gives us one place that refuses anything unexpected.
- **Leaving out CMaps, fonts and decoders:** smaller, but scanned and CJK documents would render wrongly, which users would see as a broken viewer.
- **One processing client:** simpler, but a cancelled preview would take a pending export down with it.

## Consequences

- No document can make the SDK touch the network, including through pdf.js's data files.
- Scanned, CJK and CMYK documents render correctly, and pay for their assets only when they need them.
- The SDK owns a small adapter around pdf.js's worker, which must keep up with pdf.js's API. The engine's contract tests and the fixtures catch breaking changes.
- Two asset modes must both be tested end to end.
