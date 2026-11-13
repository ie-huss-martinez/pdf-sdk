import { describe, expect, it } from "vitest";
import { JPX_COLOURS, JPX_IMAGE, jpxPdf } from "../../../test/fixtures/pdfs.js";
import { createPdfJsEngine } from "./pdfjs-engine.js";

/**
 * A real JPEG 2000 image, decoded by OpenJPEG's WebAssembly, which the SDK
 * serves itself (docs/adr/0002, docs/adr/0006). Sampling each quadrant
 * proves the decoder ran: a blank or failed image has none of the colours.
 */
async function quadrants(assetsUrl?: string) {
  const engine = createPdfJsEngine(assetsUrl ? { assetsUrl } : {});
  const document = await engine.open(jpxPdf());
  const canvas = window.document.createElement("canvas");
  await document.renderPage(0, canvas, { scale: 1, pixelRatio: 1 });
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;
  const sample = (column: number, row: number) => {
    const x = (JPX_IMAGE.x + JPX_IMAGE.width * (column + 0.5) * 0.5) * canvas.width;
    const y = (JPX_IMAGE.y + JPX_IMAGE.height * (row + 0.5) * 0.5) * canvas.height;
    return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
  };
  const found = {
    topLeft: sample(0, 0),
    topRight: sample(1, 0),
    bottomLeft: sample(0, 1),
    bottomRight: sample(1, 1),
  };
  await engine.destroy();
  return found;
}

const close = (actual: number[], expected: readonly number[]) =>
  actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= 8);

describe("JPEG 2000 images", () => {
  it.each([
    ["inline", undefined],
    ["self-hosted", "/hm-test-assets/"],
  ])("decode with the %s OpenJPEG decoder", async (_, assets) => {
    const found = await quadrants(assets && new URL(assets, location.href).href);
    for (const [quadrant, colour] of Object.entries(JPX_COLOURS)) {
      expect(
        close(found[quadrant as keyof typeof found], colour),
        `${quadrant}: ${found[quadrant as keyof typeof found]}`,
      ).toBe(true);
    }
  });
});
