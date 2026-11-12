# 0007. One assets directory, and a self-hosted processing worker

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** the sentence of [ADR 0006](0006-icc-colour-and-self-hosted-assets.md) that makes `assetsUrl` point at `dist/assets/pdfjs/`; the rest of ADR 0006 stands

## Context

[ADR 0011 in sdk-core](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0011-worker-messaging-and-assets.md) promises that every SDK works under a strict Content Security Policy, by serving its worker and WebAssembly files from the application's own origin. [ADR 0006](0006-icc-colour-and-self-hosted-assets.md) gave the viewer that mode, with `assetsUrl` pointing at `dist/assets/pdfjs/`. The processing worker was still inlined in both modes, so it needed `worker-src blob:`: a host whose policy forbids `blob:` workers could view documents but not build them. That's a gap in ADR 0011's promise.

Self-hosting the processor raises two questions:

- **Where its files go,** and how hosts point the SDK at them. A second option for a second directory would make hosts configure, copy and keep in step two things.
- **How the worker gets `qpdf.wasm`.** Inlined, it's checked against the reviewed hash at build time ([ADR 0001](0001-pdf-engines.md)). Served by the host, it's a file that can be left stale after an upgrade, or be altered.

## Decision

- **One directory:** the package's `dist/assets/` holds every self-hosted file, with one subdirectory per worker:
  - `pdfjs/`: pdf.js's worker and data, in pdf.js's own layout ([ADR 0006](0006-icc-colour-and-self-hosted-assets.md));
  - `processing/`: `processing.worker.js` and `qpdf.wasm`.
- **One option:** `assetsUrl` is where the application serves `dist/assets/`. `createPdfJsEngine` and `createPdfProcessor` both take it, and the editor will pass the same value to both. Neither has been released, so this changes no published API.
- **The self-hosted processing worker** is built from its own entry point into one minified file, with a fixed name, without the inlined WebAssembly. It fetches `qpdf.wasm` from its own directory, **checks its SHA-256 against the reviewed hash** embedded at build time, and only then compiles it. A missing, stale or altered copy fails with `WORKER_START_FAILED` and `details.asset: "qpdf.wasm"`, rather than running unknown code.
- **The inlined default doesn't change:** both workers stay inlined unless `assetsUrl` is given.
- **Content Security Policy for self-hosted mode,** both workers: `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`.

## Alternatives considered

- **A separate option for each worker,** such as `workerUrl` and `wasmUrl`, as STANDARDS sketches for `assets`: more flexible, but hosts would have to keep several URLs and copies in step, and mixing versions breaks pdf.js. One directory, copied as a whole, can't be partly upgraded.
- **The self-hosted worker with `qpdf.wasm` still inlined:** one file and no hash check, but a 3.6 MB worker, and the binary downloaded again whenever the worker changes.
- **No hash check for the self-hosted binary:** simpler, but a stale copy after an upgrade would run against a worker built for another version, and fail in ways that are hard to diagnose.

## Consequences

- Hosts with a strict CSP can use every part of the SDK, by copying one directory and passing one URL.
- A self-hosted `qpdf.wasm` that isn't this version's is refused with a clear error, at the cost of hashing 2.2 MB once per worker start, a few milliseconds.
- The build bundles the self-hosted processing worker separately. Its size has a budget of its own, and the browser tests run the built file, served exactly as the build writes it.
