import { afterEach, describe, expect, it, vi } from "vitest";
import { describePdfProcessorContract } from "../../../test/contracts/pdf-processor.contract.js";
import { inspectPdf } from "../../../test/fixtures/inspect.js";
import { formPdf, pagesPdf } from "../../../test/fixtures/pdfs.js";
import { PdfError } from "../../core/errors/pdf-error.js";
import type { PdfProcessor } from "../../core/ports/pdf-processor.js";
import { runBuild } from "./build.js";
import { loadToolkit } from "./toolkit.js";

/**
 * The pipeline the processing worker runs, called in process, so the
 * contract runs quickly in Node. The browser tests run it through the worker.
 */
function inProcessProcessor(): PdfProcessor {
  let destroyed = false;
  return {
    async build(job, options = {}) {
      if (destroyed) throw new PdfError("WORKER_TERMINATED", "Destroyed.");
      return runBuild(job, {
        toolkit: loadToolkit,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onProgress ? { progress: options.onProgress } : {}),
      });
    },
    async destroy() {
      destroyed = true;
    },
  };
}

describePdfProcessorContract("qpdf pipeline, in process", {
  createProcessor: inProcessProcessor,
  pages: pagesPdf,
  form: formPdf,
  inspect: inspectPdf,
});

describe("the qpdf pipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads qpdf and builds without calling fetch (docs/adr/0001)", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("fetch was called")));
    vi.stubGlobal("fetch", fetch);
    const output = await inProcessProcessor().build({
      sources: [{ id: "a", bytes: await pagesPdf([{ width: 612, height: 792 }]) }],
      pages: [{ source: "a", pageIndex: 0, rotation: 90 }],
      compress: {},
      encrypt: { userPassword: "secret" },
    });
    expect(output.byteLength).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an encrypted source with PASSWORD_REQUIRED", async () => {
    const locked = await inProcessProcessor().build({
      sources: [{ id: "a", bytes: await pagesPdf([{ width: 612, height: 792 }]) }],
      pages: [{ source: "a", pageIndex: 0 }],
      encrypt: { userPassword: "secret" },
    });
    await expect(
      inProcessProcessor().build({
        sources: [{ id: "a", bytes: locked }],
        pages: [{ source: "a", pageIndex: 0 }],
      }),
    ).rejects.toMatchObject({ name: "PdfError", code: "PASSWORD_REQUIRED" });
  });

  it("keeps sources the plan doesn't use out of the work, even unreadable ones", async () => {
    const output = await inProcessProcessor().build({
      sources: [
        { id: "a", bytes: await pagesPdf([{ width: 400, height: 400 }]) },
        { id: "unused", bytes: new TextEncoder().encode("not a PDF") },
      ],
      pages: [{ source: "a", pageIndex: 0 }],
    });
    expect((await inspectPdf(output)).pages).toEqual([{ width: 400, height: 400, rotation: 0 }]);
  });

  it("says plainly that flattening and image recompression aren't supported yet", async () => {
    const bytes = await pagesPdf([{ width: 612, height: 792 }]);
    const note = {
      id: "n",
      type: "text" as const,
      at: { x: 0.1, y: 0.1 },
      text: "Hi",
      size: 0.02,
      color: "#000000" as const,
    };
    await expect(
      inProcessProcessor().build({
        sources: [{ id: "a", bytes }],
        pages: [{ source: "a", pageIndex: 0, annotations: [note] }],
      }),
    ).rejects.toMatchObject({ code: "PROCESSING_FAILED" });
    await expect(
      inProcessProcessor().build({
        sources: [{ id: "a", bytes }],
        pages: [{ source: "a", pageIndex: 0 }],
        compress: { images: { quality: 0.7, maxDimension: 1600 } },
      }),
    ).rejects.toMatchObject({ code: "PROCESSING_FAILED" });
  });
});
