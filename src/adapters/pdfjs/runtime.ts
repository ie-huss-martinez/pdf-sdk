// pdf.js's display layer, loaded with import() on the first open, because it
// touches DOMMatrix when it loads (ADR 0001, ADR 0007).
export * as pdfjs from "pdfjs-dist/build/pdf.min.mjs";
