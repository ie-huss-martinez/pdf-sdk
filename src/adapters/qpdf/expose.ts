import { exposeWorker } from "@hussmartinez/sdk-core";
import { runBuild } from "./build.js";
import type { ProcessingContract } from "./contract.js";
import { loadToolkit } from "./toolkit.js";

/**
 * Answers the processing contract in a worker (docs/adr/0002). Each worker
 * entry passes where its `qpdf.wasm` comes from: inlined, or its own
 * directory when self-hosted (docs/adr/0007).
 */
export function exposeProcessing(loadWasm: () => Promise<Uint8Array>): void {
  exposeWorker<ProcessingContract>(
    {
      async build(job, context) {
        try {
          const bytes = await runBuild(job, {
            toolkit: () => loadToolkit(loadWasm),
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
    },
    // The page refuses a worker built from another version, such as a
    // self-hosted copy left over from before an upgrade (sdk-core ADR 0038).
    { packageVersion: __PDF_SDK_VERSION__ },
  );
}
