import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { describePdfProcessorContract } from "../../../test/contracts/pdf-processor.contract.js";
import { inspectPdf } from "../../../test/fixtures/inspect.js";
import { formPdf, pagesPdf } from "../../../test/fixtures/pdfs.js";
import { isPdfError } from "../../core/errors/pdf-error.js";
import { createPdfProcessor } from "./qpdf-processor.js";

describePdfProcessorContract("qpdf processor in its worker", {
  createProcessor: createPdfProcessor,
  pages: pagesPdf,
  form: formPdf,
  inspect: inspectPdf,
});

describe("the qpdf processor", () => {
  it("makes no requests but loading its own code (docs/adr/0002)", async () => {
    const processor = createPdfProcessor();
    const bytes = await pagesPdf([{ width: 612, height: 792 }]);
    // Load the processor's code and start its worker before recording.
    await processor.build({
      sources: [{ id: "a", bytes }],
      pages: [{ source: "a", pageIndex: 0 }],
    });

    await commands.startRecordingRequests();
    const output = await processor.build({
      sources: [
        { id: "a", bytes },
        { id: "form", bytes: await formPdf(), formValues: { name: "Ada", agree: true } },
      ],
      pages: [
        { source: "form", pageIndex: 0 },
        { source: "a", pageIndex: 0, rotation: 90 },
      ],
      compress: {},
      encrypt: { userPassword: "secret" },
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const requests = await commands.stopRecordingRequests();
    await processor.destroy();

    const ownCode = ({ url, type }: { url: string; type: string }) =>
      type === "script" && new URL(url).origin === location.origin;
    expect(requests.filter((request) => !ownCode(request))).toEqual([]);
    expect((await inspectPdf(output, "secret")).fields).toEqual({ name: "Ada", agree: true });
  });

  it("rejects a cancelled build with ABORTED, and keeps working", async () => {
    const processor = createPdfProcessor();
    const bytes = await pagesPdf([{ width: 612, height: 792 }]);
    const job = { sources: [{ id: "a", bytes }], pages: [{ source: "a", pageIndex: 0 }] };
    const controller = new AbortController();
    const building = processor.build({ ...job, compress: {} }, { signal: controller.signal });
    controller.abort();
    await expect(building).rejects.toSatisfy((error) => isPdfError(error, "ABORTED"));
    await expect(processor.build(job)).resolves.toBeInstanceOf(Uint8Array);
    await processor.destroy();
  });
});

describe("the qpdf processor with self-hosted assets (docs/adr/0007)", () => {
  const job = async () => ({
    sources: [{ id: "a", bytes: await pagesPdf([{ width: 612, height: 792 }]) }],
    pages: [{ source: "a", pageIndex: 0, rotation: 90 as const }],
    encrypt: { userPassword: "secret" },
  });

  it("loads its worker and qpdf.wasm only from assetsUrl", async () => {
    // The test server serves exactly what the build writes to dist/assets.
    const assetsUrl = new URL("/hm-test-assets/", location.href).href;
    const processor = createPdfProcessor({ assetsUrl });
    const built = await job();
    await commands.startRecordingRequests();
    const output = await processor.build(built);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const requests = await commands.stopRecordingRequests();
    await processor.destroy();

    expect((await inspectPdf(output, "secret")).pages).toEqual([
      { width: 612, height: 792, rotation: 90 },
    ]);
    expect(requests.map(({ url }) => url).sort()).toEqual([
      `${assetsUrl}processing/processing.worker.js`,
      `${assetsUrl}processing/qpdf.wasm`,
    ]);
  });

  it("refuses a qpdf.wasm that isn't this version's, with WORKER_START_FAILED", async () => {
    const processor = createPdfProcessor({ assetsUrl: "/hm-test-assets-tampered/" });
    await expect(processor.build(await job())).rejects.toSatisfy(
      (error) =>
        isPdfError(error, "WORKER_START_FAILED") &&
        (error.details as { asset?: string } | undefined)?.asset === "qpdf.wasm",
    );
    await processor.destroy();
  });

  it("refuses a worker from another version of the package, naming it (sdk-core ADR 0038)", async () => {
    // A host that upgraded without copying dist/assets/ again serves this.
    const assetsUrl = new URL("/hm-test-assets-stale/", location.href).href;
    const processor = createPdfProcessor({ assetsUrl });
    await expect(processor.build(await job())).rejects.toSatisfy(
      (error) =>
        isPdfError(error, "WORKER_START_FAILED") &&
        JSON.stringify(error.details) ===
          JSON.stringify({
            asset: `${assetsUrl}processing/processing.worker.js`,
            expected: __PDF_SDK_VERSION__,
            actual: "0.0.0-stale",
          }),
    );
    await processor.destroy();
  });
});
