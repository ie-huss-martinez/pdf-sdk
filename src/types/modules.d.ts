// Module types for the few non-standard imports the library makes. Declared
// here rather than through vite/client, so the library doesn't see Vite's
// or Node's global types.

/** A worker that Vite inlines into the build as a blob (ADR 0002). */
declare module "*?worker&inline" {
  const InlineWorker: new (options?: { readonly name?: string }) => Worker;
  export default InlineWorker;
}

/** pdf.js's minified display layer, with the same API as the package root. */
declare module "pdfjs-dist/build/pdf.min.mjs" {
  export * from "pdfjs-dist";
}

/** pdf.js's minified worker, which starts itself when loaded in a worker. */
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {}
