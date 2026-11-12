import PdfJsWorker from "../../workers/pdfjs.worker.ts?worker&inline";

/**
 * Starts the inlined render worker. A separate lazy chunk, so applications
 * that self-host the worker never download the inlined copy.
 */
export function createInlineWorker(): Worker {
  return new PdfJsWorker({ name: "hm-pdf-render" });
}
