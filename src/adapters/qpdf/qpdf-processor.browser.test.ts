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
