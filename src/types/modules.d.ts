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

/**
 * pdf.js's data files, inlined by tools/pdfjs-data-plugin.ts: per kind, a
 * function per file name that loads the file as base64 from its own chunk.
 */
declare module "virtual:hm-pdfjs-data" {
  export const pdfJsData: Readonly<
    Record<
      "cMapUrl" | "standardFontDataUrl" | "wasmUrl",
      Readonly<Record<string, () => Promise<string>>>
    >
  >;
}

/** qpdf's WebAssembly, as base64, inlined by tools/qpdf-wasm-plugin.ts after checking its hash. */
declare module "virtual:hm-qpdf-wasm" {
  const base64: string;
  export default base64;
}
