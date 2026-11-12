/**
 * Size budgets per entry point (ADR 0015): the brotli size of each built
 * entry, with the shared chunks it loads. They measure the unminified files in
 * dist, an upper bound: applications ship less, because their bundler
 * minifies and drops what they don't import.
 *
 * These are starting ceilings for what each entry should hold. Worker,
 * WebAssembly and PDF engine code loads lazily, with import(), in its own
 * chunks in dist/lazy, which have budgets of their own below. The feature
 * pull requests revisit these against real sizes.
 */
export default [
  {
    name: "Server-safe core (.), with the shared code it loads",
    path: ["dist/index.js", "dist/shared/*.js"],
    brotli: true,
    limit: "15 kB",
  },
  {
    name: "React entry (./react), with the shared code it loads",
    path: ["dist/react.js", "dist/shared/*.js"],
    brotli: true,
    limit: "40 kB",
  },
  {
    name: "Element entry (./element), with the shared code it loads",
    path: ["dist/element.js", "dist/shared/*.js"],
    brotli: true,
    limit: "40 kB",
  },
  {
    name: "Stylesheet (./styles.css)",
    path: "dist/styles.css",
    brotli: true,
    limit: "10 kB",
  },
  {
    // pdf.js's display layer, loaded on the first open (docs/adr/0001).
    // pdf.js 6.5.438 measures 124 kB; the budget leaves room for patch
    // releases, not for a second engine.
    name: "pdf.js display layer (lazy)",
    path: "dist/lazy/runtime-*.js",
    brotli: true,
    limit: "135 kB",
  },
  {
    // pdf.js's worker, inlined as a minified string (docs/adr/0002). It
    // measures 304 kB with pdf.js 6.5.438. Self-hosting applications never
    // load it.
    name: "pdf.js worker, inlined (lazy)",
    path: "dist/lazy/render-worker-*.js",
    brotli: true,
    limit: "330 kB",
  },
  {
    // The names of pdf.js's inlined data files, loaded the first time a
    // document needs one (docs/adr/0002). Each file is its own chunk, from
    // 0.2 kB to 70 kB, loaded only by the documents that need it.
    name: "pdf.js data index (lazy)",
    path: "dist/lazy/_virtual_hm-pdfjs-data-*.js",
    brotli: true,
    limit: "4 kB",
  },
  {
    // The processing worker, inlined as a string, loaded on the first build:
    // qpdf's WebAssembly as base64, pdfstudio, pdf-lib and the pipeline
    // (docs/adr/0001, docs/adr/0002). It measures 893 kB, of which qpdf's
    // WebAssembly is about 690 kB.
    name: "Processing worker with qpdf, inlined (lazy)",
    path: "dist/lazy/processing-worker-*.js",
    brotli: true,
    limit: "980 kB",
  },
  {
    // The self-hosted processing worker, without qpdf.wasm, which it fetches
    // from its own directory (docs/adr/0007). It measures 226 kB.
    name: "Processing worker, self-hosted",
    path: "dist/assets/processing/processing.worker.js",
    brotli: true,
    limit: "250 kB",
  },
];
