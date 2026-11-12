# 0001. PDF engines: pdf.js to view, qpdf to transform, pdf-lib to write

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

The SDK has three kinds of PDF work, and no single library that we can ship does all three well:

- **Viewing:** parse a document, render pages to a canvas, expose the text for selection and screen readers, and read form fields.
- **Transforming the structure:** assemble pages from several documents, rotate, delete and reorder them, encrypt, compress losslessly, and repair damaged files.
- **Writing content:** fill AcroForm fields, burn annotations and signatures into pages, and recompress images.

Every engine parses files from anywhere, so it is attack surface ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md)). It must have a licence compatible with Apache-2.0, make no network requests, run in a worker, and be maintained well enough to receive security fixes.

The private PDF editor this SDK grew from uses pdf.js 6.4 for viewing, `pdfstudio` 0.4.0 (qpdf compiled to WebAssembly) for transforming, and `pdf-lib` 1.17.1 for writing. Sizes below are gzip, measured from those packages.

## Decision

### Viewing: pdf.js

- **`pdfjs-dist` 6.x** (Apache-2.0), Mozilla's PDF engine. It has the most complete rendering, a text layer for selection and assistive technology, and security releases.
- **Bundled, not a dependency.** pdf.js requires its display layer and its worker to be the same version, so both are built into this package from one exactly pinned devDependency. A host's own copy of pdf.js can't be mixed in, and no global pdf.js state, such as `GlobalWorkerOptions`, is set.
- **Cost:** the display layer is about 132 KB, loaded with `import()` after mount, because it touches `DOMMatrix` when it loads ([ADR 0007](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0007-server-rendering-and-nextjs.md)). The worker is 376 KB, or about 563 KB when inlined as base64.
- **Hardening:**
  - **No code generation.** pdf.js 6 no longer has `isEvalSupported`. It compiles PostScript functions to WebAssembly or interprets them, and its worker contains no `eval` or `new Function`. The family rule "`isEvalSupported: false`" ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md)) is therefore met by construction. A test fails if the built pdf.js chunks ever contain `eval(` or `new Function`, so a future version that brings it back is caught. `sdk-core`'s standards should name the rule by its intent; this is raised there.
  - **No scripting:** `enableScripting` is off, the annotation layer's actions don't run, and the scripting sandbox (`pdf.sandbox.mjs` and the QuickJS WebAssembly) is never bundled.
  - **No XFA:** `enableXfa: false`.
  - **No network:** pdf.js never fetches CMaps, standard fonts, ICC profiles or its WebAssembly decoders itself. They come through the asset provider of [ADR 0002](0002-workers-and-assets.md).
  - **Resource limits:** `maxImageSize` and the canvas size come from the SDK's file policy, and links are limited to `http`, `https` and `mailto` with `rel="noopener noreferrer"`.

### Transforming: qpdf, through `pdfstudio`

- **qpdf 12.3.2 compiled to WebAssembly,** through `pdfstudio` (Apache-2.0). qpdf is the reference tool for PDF structure: page assembly from several documents, rotation, AES-256 encryption, object-stream compression and repair. The WebAssembly also contains zlib (zlib licence) and libjpeg (IJG licence), and uses qpdf's built-in crypto, with no OpenSSL.
- **Cost:** `qpdf.wasm` is 2.2 MB, 689 KB gzip, or about 955 KB inlined as base64. It loads only in the processing worker ([ADR 0002](0002-workers-and-assets.md)), on the first operation.
- **Supply chain:** `pdfstudio` is young, has one maintainer and ships a prebuilt binary, which makes it the SDK's largest supply-chain risk. So:
  - it's pinned to an exact version, as a bundled devDependency;
  - a unit test checks the SHA-256 of `qpdf.wasm`, so any upgrade that changes the binary shows up in review;
  - the SDK passes the compiled module in (`wasmModule`), and a test proves that loading qpdf never calls `fetch`, beyond the general no-network browser test.

  If `pdfstudio` stalls or its binary can't be trusted, we build qpdf ourselves with its documented Emscripten build, behind the same port.

### Writing content: `@cantoo/pdf-lib`, on qpdf output only

`pdf-lib` is the most widely used JavaScript library for filling forms and drawing onto existing pages. Two packages carry it: the original, and a fork that keeps its API.

| | `pdf-lib` | `@cantoo/pdf-lib` |
|---|---|---|
| Latest release | 1.17.1, 2021-11-06 | 2.11.1, 2026-09-15 |
| Last push | 2024-07 | 2026-09 |
| npm maintainers | 1 | 6 |
| Contributors | 32 | 55 |
| Open issues | 319 | 34 |
| GitHub security advisories | none | none |
| Parsing fixes since 2021 | none released | truncated files recovered, case-insensitive names, hex-string whitespace, older object streams, literal-string decryption |
| Licence | MIT | MIT; its dependencies are MIT and 0BSD |
| The editor's calls, bundled and minified | 180 KB | 252 KB, or 204 KB without its SVG and HTML dependencies |
| API compatibility | | The same code (load, `getForm`, `embedFont`, `embedPng`, `drawLine`, `drawText`, `drawImage`, `decodePDFRawStream`, the low-level object API, `save`) runs unchanged and produces equivalent documents |

- **We use `@cantoo/pdf-lib`,** pinned exactly and bundled into the processing worker. It is maintained and its parser has received the robustness fixes that matter for hostile input, and it's API-compatible. Upstream `pdf-lib` hasn't released in five years.
- **Its costs, and why they're acceptable:**
  - it's 72 KB larger, because `drawSvg` pulls in `culori`, `html-entities` and an HTML parser that bundlers can't drop. That code never sees file data, and it sits in a lazily loaded worker chunk that's already about 1 MB with qpdf;
  - three of its dependency ranges are open-ended (`>=`). It's bundled at build time, so our lockfile, release-age delay and trust policy decide those versions, and hosts never resolve them;
  - its maintainers state that they maintain it for their own product. If it stops, upstream `pdf-lib` is a drop-in fallback for the API we use.
- **pdf-lib only parses bytes that qpdf has rewritten.** Every write goes through qpdf first, which repairs and normalises the file, so pdf-lib's parser never sees the original hostile input.

### Licences

Everything bundled is credited in `NOTICE`: pdf.js (Apache-2.0) and its decoders, OpenJPEG (BSD-2-Clause), PDFium's JBIG2 decoder (BSD-3-Clause) and qcms (MIT); qpdf (Apache-2.0), zlib and libjpeg (IJG); `@cantoo/pdf-lib` and its dependencies (MIT, 0BSD). The CMaps, standard fonts and ICC profile are credited if they're bundled ([ADR 0002](0002-workers-and-assets.md)).

### Upgrades

Each engine is upgraded in its own pull request, which runs the engine's contract tests and the end-to-end fixtures (scanned JBIG2 and JPX images, CJK text, forms, encrypted files and damaged files).

## Alternatives considered

- **PDFium compiled to WebAssembly, for everything:** one engine for viewing and editing, with Chrome's parser. But it's 4–5 MB of WebAssembly before writing support, its JavaScript bindings are young, and pdf.js's text layer and accessibility are more mature.
- **MuPDF.js:** excellent, but AGPL-3.0, which isn't compatible with an Apache-2.0 library.
- **pdf-lib for structure too, without qpdf:** smaller, but upstream can't encrypt, its repair and compression are weak, and it would have to parse every hostile file directly.
- **qpdf alone:** it can't fill form appearances or draw onto pages.
- **Upstream `pdf-lib`:** smaller, but unmaintained since 2021, with no fixes for malformed input.
- **Building qpdf's WebAssembly ourselves now:** the most control, but a build pipeline to maintain before the SDK exists. It stays the fallback if `pdfstudio` fails us.

## Consequences

- The SDK ships three engines. Each loads only when needed, and the lazily loaded chunks get their own size budgets.
- The engines are behind the `PdfEngine` and `PdfProcessor` ports, so hosts and future versions can replace any of them without changing the editor.
- pdf.js and qpdf security releases must be picked up quickly. Dependabot proposes them, and their pull requests carry the fixture tests.
- The WebAssembly hash test makes every change to the qpdf binary a deliberate, reviewed change.
