import type { PdfToolkit } from "pdfstudio";

let toolkit: Promise<PdfToolkit> | undefined;

/**
 * Starts qpdf once per worker: compiles its WebAssembly from the bytes
 * inlined into the worker, after their hash was checked at build time, and
 * hands the compiled module to pdfstudio, so nothing is ever fetched
 * (docs/adr/0001). Loaded on the first build, after exposeWorker.
 */
export function loadToolkit(): Promise<PdfToolkit> {
  toolkit ??= (async () => {
    const [{ createPdfToolkit }, { default: base64 }] = await Promise.all([
      import("pdfstudio"),
      import("virtual:hm-qpdf-wasm"),
    ]);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return createPdfToolkit({ wasmModule: await WebAssembly.compile(bytes) });
  })();
  // A failed start is retried on the next build, rather than cached.
  toolkit.catch(() => {
    toolkit = undefined;
  });
  return toolkit;
}
