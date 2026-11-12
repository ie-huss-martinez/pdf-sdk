import type { PdfToolkit } from "pdfstudio";

let toolkit: Promise<PdfToolkit> | undefined;

/**
 * Starts qpdf once per worker: compiles its WebAssembly from the bytes the
 * worker's loader provides, inlined or from its own directory, and hands the
 * compiled module to pdfstudio, so pdfstudio never fetches anything itself
 * (docs/adr/0001). Called on the first build, after exposeWorker.
 */
export function loadToolkit(loadWasm: () => Promise<Uint8Array>): Promise<PdfToolkit> {
  toolkit ??= (async () => {
    const [{ createPdfToolkit }, bytes] = await Promise.all([import("pdfstudio"), loadWasm()]);
    return createPdfToolkit({ wasmModule: await WebAssembly.compile(bytes as BufferSource) });
  })();
  // A failed start is retried on the next build, rather than cached.
  toolkit.catch(() => {
    toolkit = undefined;
  });
  return toolkit;
}

/** Decodes base64 without fetching a `data:` URL. */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The inlined `qpdf.wasm`, checked against its hash at build time. */
export async function inlinedWasm(): Promise<Uint8Array> {
  const { default: base64 } = await import("virtual:hm-qpdf-wasm");
  return decodeBase64(base64);
}
