import { entryBudget, importBudget } from "@hussmartinez/sdk-config/size";

/**
 * Size budgets (sdk-core ADR 0015, ADR 0055 and ADR 0056), in brotli.
 *
 * - **Entry ceilings** measure each built entry and the chunks it loads up
 *   front, as built. They bound what any application receives.
 * - **Import budgets** measure what an application ships when it imports
 *   part of an entry: bundled and minified, without React, the family's
 *   packages and the entry's lazy chunks. Each entry that comes apart has a
 *   floor, each export well above it, and a typical application's set.
 *   A floor's limit is its measurement rounded up to the next 0.1 kB, and
 *   any other to the next 0.5 kB. A floor that moves is a leak to fix,
 *   never a budget to raise.
 * - **Lazy chunks** have budgets of their own, measured as built: worker,
 *   WebAssembly and pdf.js code loads with import(), in dist/lazy.
 *
 * The element entry registers nothing yet, so it has only a ceiling.
 */

/** A budget measured on the built files, not bundled by esbuild. */
const built = (budget) => ({ ...budget, brotli: true, disablePlugins: ["@size-limit/esbuild"] });

export default [
  // The server-safe core (.).
  entryBudget({ name: "Core (.), as built", entry: "dist/index.js", limit: "15 kB" }),
  importBudget({
    // The floor: the error class, which a host uses to show the session's errors.
    name: "Core: the floor, PdfError",
    entry: "dist/index.js",
    imports: "{ PdfError }",
    limit: "0.7 kB",
  }),
  importBudget({
    name: "Core: createPdfSession",
    entry: "dist/index.js",
    imports: "{ createPdfSession }",
    limit: "6.5 kB",
  }),
  importBudget({
    name: "Core: createPdfJsEngine",
    entry: "dist/index.js",
    imports: "{ createPdfJsEngine }",
    limit: "4 kB",
  }),
  importBudget({
    name: "Core: readPdfPlanDocument",
    entry: "dist/index.js",
    imports: "{ readPdfPlanDocument }",
    limit: "3 kB",
  }),
  importBudget({
    // What a headless editor uses together: a session over the engine and processor.
    name: "Core: an editor's set",
    entry: "dist/index.js",
    imports: "{ createPdfSession, createPdfJsEngine, createPdfProcessor }",
    limit: "9.5 kB",
  }),

  // The React entry (./react).
  entryBudget({ name: "React (./react), as built", entry: "dist/react.js", limit: "40 kB" }),
  importBudget({
    // The floor: the components' catalogue, which every component reads.
    name: "React: the floor, pdfEditorMessages",
    entry: "dist/react.js",
    imports: "{ pdfEditorMessages }",
    limit: "1.3 kB",
  }),
  importBudget({
    name: "React: PdfThumbnails",
    entry: "dist/react.js",
    imports: "{ PdfThumbnails }",
    limit: "4.5 kB",
  }),
  importBudget({
    name: "React: PdfViewer",
    entry: "dist/react.js",
    imports: "{ PdfViewer }",
    limit: "4.5 kB",
  }),
  importBudget({
    // A session from the provider brings the engine and processor factories.
    name: "React: PdfSessionProvider",
    entry: "dist/react.js",
    imports: "{ PdfSessionProvider }",
    limit: "10.5 kB",
  }),
  importBudget({
    // What a typical application imports: the whole editor.
    name: "React: PdfEditor",
    entry: "dist/react.js",
    imports: "{ PdfEditor }",
    limit: "18 kB",
  }),

  // The element entry (./element): it registers nothing yet.
  entryBudget({ name: "Element (./element), as built", entry: "dist/element.js", limit: "40 kB" }),

  built({ name: "Stylesheet (./styles.css)", path: "dist/styles.css", limit: "10 kB" }),
  built({
    // pdf.js's display layer, loaded on the first open (docs/adr/0001).
    // pdf.js 6.5.438 measures 124 kB; the budget leaves room for patch
    // releases, not for a second engine.
    name: "pdf.js display layer (lazy)",
    path: "dist/lazy/runtime-*.js",
    limit: "135 kB",
  }),
  built({
    // pdf.js's worker, inlined as a minified string (docs/adr/0002). It
    // measures 304 kB with pdf.js 6.5.438. Self-hosting applications never
    // load it.
    name: "pdf.js worker, inlined (lazy)",
    path: "dist/lazy/render-worker-*.js",
    limit: "330 kB",
  }),
  built({
    // The names of pdf.js's inlined data files, loaded the first time a
    // document needs one (docs/adr/0002). Each file is its own chunk, from
    // 0.2 kB to 70 kB, loaded only by the documents that need it.
    name: "pdf.js data index (lazy)",
    path: "dist/lazy/_virtual_hm-pdfjs-data-*.js",
    limit: "4 kB",
  }),
  built({
    // The processing worker, inlined as a string, loaded on the first build:
    // qpdf's WebAssembly as base64, pdfstudio, pdf-lib and the pipeline
    // (docs/adr/0001, docs/adr/0002). It measures 893 kB, of which qpdf's
    // WebAssembly is about 690 kB.
    name: "Processing worker with qpdf, inlined (lazy)",
    path: "dist/lazy/processing-worker-*.js",
    limit: "980 kB",
  }),
  built({
    // The self-hosted processing worker, without qpdf.wasm, which it fetches
    // from its own directory (docs/adr/0007). It measures 226 kB.
    name: "Processing worker, self-hosted",
    path: "dist/assets/processing/processing.worker.js",
    limit: "250 kB",
  }),
];
