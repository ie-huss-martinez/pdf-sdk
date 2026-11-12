import { createWorkerClient, type WorkerClient } from "@hussmartinez/sdk-core";
import { asPdfError } from "../../core/errors/abort.js";
import { PdfError } from "../../core/errors/pdf-error.js";
import type { PdfBuildJob } from "../../core/model/build-job.js";
import type { PdfBuildOptions, PdfProcessor } from "../../core/ports/pdf-processor.js";
import type { ProcessingContract } from "./contract.js";

/**
 * Creates the SDK's {@link PdfProcessor}, backed by qpdf and pdf-lib in a
 * worker (docs/adr/0001, docs/adr/0002).
 *
 * Nothing starts until the first `build()`. The worker is inlined, which
 * needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'` in a Content
 * Security Policy, and it never fetches anything. A build that can't stop
 * when cancelled terminates its worker, which starts again on the next build.
 *
 * @example
 * ```ts
 * const processor = createPdfProcessor();
 * const protectedPdf = await processor.build({
 *   sources: [{ id: "a", bytes }],
 *   pages: [{ source: "a", pageIndex: 0 }, { source: "a", pageIndex: 1, rotation: 90 }],
 *   encrypt: { userPassword: "correct horse" },
 * });
 * ```
 *
 * @public
 */
export function createPdfProcessor(): PdfProcessor {
  let client: WorkerClient<ProcessingContract> | undefined;
  let destroyed = false;

  const start = (): WorkerClient<ProcessingContract> => {
    client ??= createWorkerClient<ProcessingContract>({
      // The worker's chunk loads on the first build, not with this module.
      createWorker: () => {
        if (!inlineWorker) {
          throw new PdfError("WORKER_START_FAILED", "The processing worker hasn't loaded.");
        }
        return inlineWorker();
      },
      errorClasses: { PdfError },
    });
    return client;
  };
  let inlineWorker: (() => Worker) | undefined;

  return {
    async build(job: PdfBuildJob, options: PdfBuildOptions = {}): Promise<Uint8Array> {
      if (destroyed) {
        throw new PdfError("WORKER_TERMINATED", "The PDF processor was destroyed.");
      }
      inlineWorker ??= (await import("./processing-worker.js")).createInlineWorker;
      let outcome: Awaited<ReturnType<WorkerClient<ProcessingContract>["call"]>>;
      try {
        outcome = await start().call("build", job, {
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.onProgress ? { onProgress: options.onProgress } : {}),
          ...(options.transfer ? { transfer: true } : {}),
        });
      } catch (error) {
        // The client's own failures, such as ABORTED or WORKER_CRASHED, are
        // SdkErrors; the port promises PdfError.
        throw asPdfError(error, "The PDF couldn't be built.");
      }
      if (!outcome.ok) {
        throw outcome.error === "RangeError"
          ? new RangeError(outcome.message)
          : new TypeError(outcome.message);
      }
      return outcome.bytes;
    },
    async destroy(): Promise<void> {
      destroyed = true;
      client?.destroy();
      client = undefined;
    },
  };
}
