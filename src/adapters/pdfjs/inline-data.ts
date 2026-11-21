import { pdfJsData } from "virtual:hm-pdfjs-data";

/**
 * pdf.js's data files, inlined: CMaps, standard fonts and the WebAssembly
 * decoders, each loaded from its own chunk when a document needs it
 * (docs/adr/0002). Imported as `#hm-pdf-inline-data`, which a build with the
 * `hm-self-hosted` condition maps to a stub instead (sdk-core ADR 0060).
 */
export function inlineData(): typeof pdfJsData {
  return pdfJsData;
}
