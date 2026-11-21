import { PdfError } from "../core/errors/pdf-error.js";

/**
 * What an application's build gets instead of the inlined workers and data
 * when it sets the `hm-self-hosted` resolve condition (sdk-core ADR 0060):
 * `#hm-pdf-render-worker`, `#hm-pdf-processing-worker` and
 * `#hm-pdf-inline-data` all map here, so none of them is bundled. Such a
 * build must pass `assetsUrl`; without it, starting a worker fails here,
 * loudly, rather than with a bare error from the module system.
 */
function leftOut(): PdfError {
  return new PdfError(
    "WORKER_START_FAILED",
    "This build left the PDF SDK's inlined workers out, with the hm-self-hosted condition, so assetsUrl is required.",
    { details: { condition: "hm-self-hosted", missing: "assetsUrl" } },
  );
}

/** Stands in for the inlined render and processing workers. */
export function createInlineWorker(): Worker {
  throw leftOut();
}

/** Stands in for pdf.js's inlined data files. */
export function inlineData(): never {
  throw leftOut();
}
