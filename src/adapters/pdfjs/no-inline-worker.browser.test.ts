import { expect, it, vi } from "vitest";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { isPdfError } from "../../core/errors/pdf-error.js";
import { createPdfJsEngine } from "./pdfjs-engine.js";

// A build with the hm-self-hosted condition gets the stub instead of the
// inlined render worker (sdk-core ADR 0060).
vi.mock("#hm-pdf-render-worker", () => import("../no-inline-workers.js"));

it("says why the render worker can't start in a build that left it out, without assetsUrl", async () => {
  const engine = createPdfJsEngine();
  try {
    await expect(
      engine.open(encodeFakePdf({ pages: [{ width: 600, height: 800 }] })),
    ).rejects.toSatisfy(
      (error) =>
        isPdfError(error, "WORKER_START_FAILED") &&
        JSON.stringify(error.details) ===
          JSON.stringify({ condition: "hm-self-hosted", missing: "assetsUrl" }),
    );
  } finally {
    await engine.destroy();
  }
});
