import type { PdfBuildJob, PdfBuildProgress } from "../../core/model/build-job.js";

/**
 * How a build ended, as sent back by the processing worker. A job that
 * refers to an unknown source or page is the caller's mistake, which the
 * port reports as `TypeError` or `RangeError`. Those don't survive the
 * worker boundary as themselves, so they travel as data and are rethrown
 * as the same class on the page.
 */
export type BuildOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: "TypeError" | "RangeError"; readonly message: string };

/** The processing worker's RPC contract (docs/adr/0002), shared by the page and the worker. */
export interface ProcessingContract {
  readonly build: {
    readonly input: PdfBuildJob;
    readonly output: BuildOutcome;
    readonly progress: PdfBuildProgress;
  };
}
