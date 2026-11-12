/** The kinds of data pdf.js asks the page for when `useWorkerFetch` is off. */
export type PdfJsDataKind = "cMapUrl" | "standardFontDataUrl" | "wasmUrl";

/** Called for every data file pdf.js asks for. */
export type PdfJsDataListener = (kind: PdfJsDataKind, filename: string) => void;

/**
 * The prefix pdf.js puts before the file name of a JavaScript decoder it
 * imports when a WebAssembly decoder is unavailable. It isn't a fetchable
 * scheme, so that import fails without a request (ADR 0002).
 */
export const NO_NETWORK_URL = "hm-pdf-no-network:/";

/**
 * A `BinaryDataFactory` for pdf.js that answers no request: CMaps, standard
 * font data and WebAssembly decoders are refused, so pdf.js falls back to
 * system fonts and leaves undecodable images unpainted, and never fetches
 * anything itself. The asset provider replaces it with one that serves the
 * bundled files (ADR 0002).
 */
export function createRefusingDataFactory(listener?: PdfJsDataListener) {
  return class RefusingDataFactory {
    async fetch({ kind, filename }: { kind: PdfJsDataKind; filename: string }): Promise<never> {
      listener?.(kind, filename);
      throw new Error(`The PDF SDK doesn't load ${kind} data (${filename}).`);
    }
  };
}
