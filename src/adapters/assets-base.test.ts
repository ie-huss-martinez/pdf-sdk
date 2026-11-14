import { describe, expect, it } from "vitest";
import { createPdfJsEngine } from "./pdfjs/pdfjs-engine.js";
import { createPdfProcessor } from "./qpdf/qpdf-processor.js";

/**
 * `assetsUrl` mistakes fail when the engine or processor is created, not on
 * the first document (sdk-core ADR 0038). The unit project runs in Node, as
 * a server renders, so there's no page to resolve a relative URL against.
 */
describe("assetsUrl", () => {
  it.each([
    ["a relative URL with no page", "/pdf-sdk/"],
    ["a query", "https://example.com/pdf-sdk/?v=1"],
    ["a fragment", "https://example.com/pdf-sdk/#assets"],
  ])("fails at once with TypeError for %s", (_, assetsUrl) => {
    expect(() => createPdfJsEngine({ assetsUrl })).toThrow(TypeError);
    expect(() => createPdfProcessor({ assetsUrl })).toThrow(TypeError);
  });

  it("takes an absolute URL, with or without a trailing slash", async () => {
    for (const assetsUrl of [
      "https://example.com/pdf-sdk",
      new URL("https://example.com/pdf-sdk/"),
    ]) {
      const engine = createPdfJsEngine({ assetsUrl });
      const processor = createPdfProcessor({ assetsUrl });
      await engine.destroy();
      await processor.destroy();
    }
  });
});
