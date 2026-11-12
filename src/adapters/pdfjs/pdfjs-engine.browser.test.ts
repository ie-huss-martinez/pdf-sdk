import { afterEach, describe, expect, it } from "vitest";
import { describePdfEngineContract } from "../../../test/contracts/pdf-engine.contract.js";
import { encryptedPdf, reportPdf, SAFE_LINKS } from "../../../test/fixtures/pdfs.js";
import { isPdfError } from "../../core/errors/pdf-error.js";
import type { PdfEngine } from "../../core/ports/pdf-engine.js";
import { createPdfJsEngine } from "./pdfjs-engine.js";

describePdfEngineContract("pdf.js engine", {
  createEngine: () => createPdfJsEngine(),
  canRender: true,
  document: reportPdf,
  expected: {
    pages: [
      { width: 612, height: 792, rotation: 0 },
      { width: 842, height: 595, rotation: 90 },
    ],
    firstPageText: "Quarterly report",
    firstPageLinks: SAFE_LINKS,
    firstPageFields: {
      name: { type: "text", value: "" },
      agree: { type: "checkbox", value: false },
    },
  },
  encrypted: encryptedPdf,
});

describe("the pdf.js engine", () => {
  const engines: PdfEngine[] = [];
  const track = (engine: PdfEngine) => {
    engines.push(engine);
    return engine;
  };
  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it("opens documents with self-hosted assets (docs/adr/0007)", async () => {
    // The test server serves exactly what the build writes to dist/assets.
    const engine = track(createPdfJsEngine({ assetsUrl: "/hm-test-assets" }));
    const document = await engine.open(await reportPdf());
    expect(document.pageCount).toBe(2);
  });

  it("fails pending work with WORKER_CRASHED when the worker crashes", async () => {
    const engine = track(createPdfJsEngine({ assetsUrl: "/test/fixtures/crashing-assets/" }));
    await expect(engine.open(await reportPdf())).rejects.toSatisfy((error) =>
      isPdfError(error, "WORKER_CRASHED"),
    );
  });

  it("rejects an open cancelled while loading, and keeps working", async () => {
    const engine = track(createPdfJsEngine());
    const bytes = await reportPdf();
    const controller = new AbortController();
    const opening = engine.open(bytes, { signal: controller.signal });
    controller.abort();
    await expect(opening).rejects.toSatisfy((error) => isPdfError(error, "ABORTED"));
    const document = await engine.open(bytes);
    expect(document.pageCount).toBe(2);
  });

  it("shares one worker between documents, and keeps them independent", async () => {
    const engine = track(createPdfJsEngine());
    const [first, second] = await Promise.all([
      engine.open(await reportPdf()),
      engine.open(await reportPdf()),
    ]);
    await first?.destroy();
    await expect(second?.getPage(1)).resolves.toMatchObject({ rotation: 90 });
  });

  it("rejects opens after it's destroyed", async () => {
    const engine = createPdfJsEngine();
    await engine.destroy();
    await expect(engine.open(await reportPdf())).rejects.toSatisfy((error) =>
      isPdfError(error, "WORKER_TERMINATED"),
    );
  });
});
