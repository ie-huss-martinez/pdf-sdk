import ProcessingWorker from "../../workers/processing.worker.ts?worker&inline";

/** Starts the inlined processing worker, from its own lazy chunk. */
export function createInlineWorker(): Worker {
  return new ProcessingWorker({ name: "hm-pdf-processing" });
}
