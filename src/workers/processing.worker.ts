// The processing worker (docs/adr/0002): qpdf and pdf-lib behind the family's
// worker RPC. exposeWorker runs first, so the worker answers at once; qpdf's
// WebAssembly compiles on the first build, from bytes inlined into this
// worker, so nothing is ever fetched (docs/adr/0001).
import { exposeWorker } from "@hussmartinez/sdk-core";
import { runBuild } from "../adapters/qpdf/build.js";
import type { ProcessingContract } from "../adapters/qpdf/contract.js";
import { loadToolkit } from "../adapters/qpdf/toolkit.js";

exposeWorker<ProcessingContract>({
  async build(job, context) {
    try {
      const bytes = await runBuild(job, {
        toolkit: loadToolkit,
        signal: context.signal,
        progress: (value) => context.progress(value),
      });
      return { ok: true, bytes };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return {
          ok: false,
          error: error.name as "TypeError" | "RangeError",
          message: error.message,
        };
      }
      throw error;
    }
  },
});
