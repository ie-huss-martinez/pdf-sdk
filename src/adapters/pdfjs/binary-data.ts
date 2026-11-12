/** The kinds of data pdf.js asks the page for when `useWorkerFetch` is off. */
export type PdfJsDataKind = "cMapUrl" | "standardFontDataUrl" | "wasmUrl";

/** Called for every data file pdf.js asks for. */
export type PdfJsDataListener = (kind: PdfJsDataKind, filename: string) => void;

/**
 * The prefix pdf.js puts before the file name of a JavaScript decoder it
 * imports when a WebAssembly decoder can't start, for example under a
 * Content Security Policy without 'wasm-unsafe-eval'. It isn't a fetchable
 * scheme, so that import fails without a request (docs/adr/0002).
 */
export const NO_NETWORK_URL = "hm-pdf-no-network:/";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * A `BinaryDataFactory` for pdf.js that serves the bundled CMaps, standard
 * fonts and WebAssembly decoders from lazy chunks, without the network
 * (docs/adr/0002). Only those files are served: any other kind or name,
 * such as a path, is refused.
 */
export function createInlineDataFactory(listener?: PdfJsDataListener) {
  return class InlineDataFactory {
    async fetch({
      kind,
      filename,
    }: {
      kind: PdfJsDataKind;
      filename: string;
    }): Promise<Uint8Array> {
      listener?.(kind, filename);
      const { pdfJsData } = await import("virtual:hm-pdfjs-data");
      const files = Object.hasOwn(pdfJsData, kind) ? pdfJsData[kind] : undefined;
      const load = files && Object.hasOwn(files, filename) ? files[filename] : undefined;
      if (!load) {
        throw new Error(`The PDF SDK doesn't serve ${kind} data named ${filename}.`);
      }
      return decodeBase64(await load());
    }
  };
}
