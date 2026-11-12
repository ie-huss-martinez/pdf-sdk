import { createWorkerClient, type WorkerClient } from "@hussmartinez/sdk-core";
import { asPdfError } from "../../core/errors/abort.js";
import { PdfError } from "../../core/errors/pdf-error.js";
import type { PdfBuildJob } from "../../core/model/build-job.js";
import type { PdfBuildOptions, PdfProcessor } from "../../core/ports/pdf-processor.js";
import { assetsBase } from "../assets-url.js";
import type { ProcessingContract } from "./contract.js";

/**
 * Options for {@link createPdfProcessor}.
 *
 * @public
 */
export interface PdfProcessorOptions {
  /**
   * Where your application serves the package's `dist/assets/` directory,
   * on its own origin, such as `"/pdf-sdk/"`, the same URL as the engine's.
   * The worker then loads from `processing/processing.worker.js`, and
   * fetches `processing/qpdf.wasm`, which it checks against this version's
   * hash before using it. Use it for Content Security Policies without
   * `worker-src blob:` (docs/adr/0007). By default the worker is inlined.
   */
  readonly assetsUrl?: string | URL;
}

/**
 * Creates the SDK's {@link PdfProcessor}, backed by qpdf and pdf-lib in a
 * worker (docs/adr/0001, docs/adr/0002).
 *
 * Nothing starts until the first `build()`. By default the worker is
 * inlined, which needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'`
 * in a Content Security Policy, and it never fetches anything. With
 * `assetsUrl`, it loads from your own origin instead. A build that can't stop
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
export function createPdfProcessor(options: PdfProcessorOptions = {}): PdfProcessor {
  const base = assetsBase(options.assetsUrl);
  let client: WorkerClient<ProcessingContract> | undefined;
  let destroyed = false;

  const start = (): WorkerClient<ProcessingContract> => {
    client ??= createWorkerClient<ProcessingContract>({
      // The worker's chunk loads on the first build, not with this module.
      createWorker: () => {
        if (base) {
          return new Worker(`${base}processing/processing.worker.js`, {
            type: "module",
            name: "hm-pdf-processing",
          });
        }
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
      if (!base) {
        inlineWorker ??= (await import("./processing-worker.js")).createInlineWorker;
      }
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
