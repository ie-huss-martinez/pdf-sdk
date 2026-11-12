# 0006. ICC colour needs self-hosted assets; inline mode uses approximate colour

- **Status:** Accepted; where `assetsUrl` points is superseded by [0007](0007-one-assets-directory.md)
- **Date:** 2026-11-12
- **Supersedes:** the parts of [ADR 0002](0002-workers-and-assets.md) that serve the ICC profile and the qcms decoder through the asset provider, and that serve self-hosted files through it; the rest of ADR 0002 stands

## Context

[ADR 0002](0002-workers-and-assets.md) decided that pdf.js gets every data file it needs from a provider of ours, a `BinaryDataFactory`, with `useWorkerFetch: false`. Inline mode answers from lazy chunks, and self-hosted mode from `assets`, so the SDK decides what's loaded, and from where.

Building the provider against pdf.js 6.5.438 showed that this can't cover colour management:

- **The factory sees only three kinds of file:** CMaps, standard fonts, and the JBIG2 and OpenJPEG WebAssembly decoders.
- **ICC colour is loaded differently.** The ICC profile pdf.js uses for CMYK, and the qcms WebAssembly that converts ICC-based colour, are loaded **only** inside pdf.js's worker, with a synchronous `XMLHttpRequest`, from `iccUrl` and `wasmUrl`, and **only when `useWorkerFetch` is on**. With it off, pdf.js turns ICC colour management off and uses its built-in approximate conversions instead.
- **Synchronous requests need real URLs.** They can't be answered by a factory, and a `blob:` URL can't be used as a base that pdf.js appends file names to.

So accurate ICC colour needs pdf.js to fetch files itself, from real URLs.

## Decision

There are two asset modes, and they differ in colour accuracy:

| | Inline (default) | Self-hosted (`assetsUrl`) |
|---|---|---|
| Worker | Inlined, as a `blob:` worker | `assetsUrl` + `build/pdf.worker.min.mjs` |
| CMaps, standard fonts, JBIG2 and OpenJPEG | The SDK's factory, from lazy chunks, with an allowlist | pdf.js fetches them from `assetsUrl` (`useWorkerFetch: true`) |
| ICC-based and CMYK colour | **Approximate:** pdf.js's built-in conversions | **Accurate:** qcms and the ICC profile, from `assetsUrl` |
| Requests | None, beyond loading the package's own chunks | Only to `assetsUrl`, on the application's own origin |
| Content Security Policy | `worker-src blob:`, `script-src 'wasm-unsafe-eval'` | `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'` |

- **Inline stays the default.** It needs no configuration, and most documents use RGB or grey, which both modes render identically. The difference shows in print-oriented documents with CMYK or ICC-based colour, which come out somewhat less faithful.
- **Self-hosted is one option, `assetsUrl`.** It points at the package's `dist/assets/pdfjs/` directory, served from the application's origin. That directory has pdf.js's own layout, so the worker and every data file load from there. It replaces the separate `workerUrl`, which hasn't been released.
- **In self-hosted mode pdf.js fetches by itself,** so the SDK's allowlist doesn't apply. pdf.js still only builds URLs from fixed names, such as its own list of known CMaps, under the URL the application gives, and the browser's same-origin rules and the CSP's `connect-src 'self'` keep those requests on the application's origin.
- **The README says which to choose:**
  - inline for the simplest setup;
  - self-hosted for strict Content Security Policies without `blob:` workers, and for applications where print colour must be accurate.
- **Bundled files** (both modes):
  - Adobe's CMaps, the Foxit standard fonts, the JBIG2 and OpenJPEG decoders and, self-hosted only, qcms and the ICC profile, each credited in `NOTICE`;
  - **left out:** pdf.js's Liberation fonts, which are GPL-2.0 with a font exception rather than a licence compatible with bundling into an Apache-2.0 package. pdf.js renders non-embedded Helvetica and Arial with system fonts instead. Also left out, as ADR 0002 already decided: the JavaScript decoder fallbacks and the QuickJS scripting sandbox.

## Alternatives considered

- **Patching pdf.js to load ICC data through the factory:** accurate colour in inline mode, but a fork of pdf.js to maintain at every release.
- **`useWorkerFetch: true` with `data:` URLs:** pdf.js appends file names to the base URL, which a `data:` URL can't take, and a strict `connect-src` blocks `data:` anyway.
- **Self-hosted as the default:** accurate colour everywhere, but every application would have to copy and serve files before the SDK works at all, which is the integration failure ADR 0011 in sdk-core avoids by inlining.
- **Bundling the Liberation fonts:** slightly closer rendering of non-embedded Helvetica and Arial, at the cost of GPL-licensed files inside an Apache-2.0 package.

## Consequences

- Inline mode makes no request for data, and its colour is approximate for ICC-based and CMYK content. Most documents look the same either way.
- Self-hosted mode gives accurate colour, at the cost of serving a directory, and of trusting pdf.js to build its own URLs within it.
- Both modes are tested in three browsers. Inline mode must make no requests but its own script chunks. Self-hosted mode must request data only under `assetsUrl`, including the ICC profile and qcms, which shows colour management is on.
- The package grows by about 3 MB, unpacked, for the inlined chunks and the self-hosted copy. Applications download only the files their documents need.
