import { describe, expect, it, vi } from "vitest";
import { encodeFakePdf } from "../../test/fakes/fake-pdf.js";
import { isPdfError } from "../core/errors/pdf-error.js";
import { createInlineWorker, inlineData } from "./no-inline-workers.js";

// A build with the hm-self-hosted condition gets this module instead of the
// inlined workers and data (sdk-core ADR 0060).
vi.mock("#hm-pdf-processing-worker", () => import("./no-inline-workers.js"));

const leftOut = (error: unknown) =>
  isPdfError(error, "WORKER_START_FAILED") &&
  error.message.includes("hm-self-hosted") &&
  error.message.includes("assetsUrl") &&
  JSON.stringify(error.details) ===
    JSON.stringify({ condition: "hm-self-hosted", missing: "assetsUrl" });

describe("the stub for a build without inlined workers (sdk-core ADR 0060)", () => {
  it("refuses to start a worker, naming the condition and the missing assetsUrl", () => {
    expect(() => createInlineWorker()).toThrow(
      expect.toSatisfy(leftOut, "WORKER_START_FAILED naming hm-self-hosted and assetsUrl"),
    );
  });

  it("refuses to serve pdf.js's inlined data the same way", () => {
    expect(() => inlineData()).toThrow(expect.toSatisfy(leftOut, "the same error"));
  });

  it("reaches a processor's caller unchanged, when a build needs the inlined worker", async () => {
    const { createPdfProcessor } = await import("./qpdf/qpdf-processor.js");
    const processor = createPdfProcessor();
    const pdf = encodeFakePdf({ pages: [{ width: 600, height: 800 }] });
    await expect(
      processor.build({
        sources: [{ id: "s1", bytes: pdf }],
        pages: [{ source: "s1", pageIndex: 0 }],
      }),
    ).rejects.toSatisfy(leftOut);
    await processor.destroy();
  });
});
