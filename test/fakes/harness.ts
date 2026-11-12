import type { PdfEngineHarness } from "../contracts/pdf-engine.contract.js";
import type { PdfProcessorHarness } from "../contracts/pdf-processor.contract.js";
import { LINKS, SAFE_LINKS } from "../fixtures/pdfs.js";
import { createFakeEngine } from "./fake-engine.js";
import { decodeFakePdf, encodeFakePdf } from "./fake-pdf.js";
import { createFakeProcessor } from "./fake-processor.js";

const field = { x: 0.1, y: 0.1, width: 0.4, height: 0.04 };

export function fakeEngineHarness(canRender: boolean): PdfEngineHarness {
  return {
    createEngine: createFakeEngine,
    canRender,
    async document() {
      return encodeFakePdf({
        pages: [
          {
            width: 612,
            height: 792,
            text: "Quarterly report",
            links: LINKS.map((url, index) => ({
              rect: { x: 0.1, y: 0.2 + index * 0.05, width: 0.3, height: 0.03 },
              url,
            })),
          },
          { width: 842, height: 595, rotation: 90 },
        ],
        fields: [
          { name: "name", type: "text", page: 0, rect: field, value: "" },
          { name: "agree", type: "checkbox", page: 0, rect: field, value: false },
        ],
      });
    },
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
    async encrypted() {
      return encodeFakePdf({ pages: [{ width: 612, height: 792 }], password: "secret" });
    },
  };
}

export const fakeProcessorHarness: PdfProcessorHarness = {
  createProcessor: createFakeProcessor,
  async pages(sizes) {
    return encodeFakePdf({ pages: sizes.map((size) => ({ ...size })) });
  },
  async form() {
    return encodeFakePdf({
      pages: [{ width: 612, height: 792 }],
      fields: [
        { name: "name", type: "text", page: 0, rect: field, value: "" },
        { name: "agree", type: "checkbox", page: 0, rect: field, value: false },
      ],
    });
  },
  async inspect(bytes, password) {
    const pdf = decodeFakePdf(bytes);
    if (!pdf) throw new Error("Not a fake PDF.");
    if (pdf.password !== undefined && pdf.password !== password) {
      throw new Error("Wrong or missing password.");
    }
    return {
      pages: pdf.pages.map(({ width, height, rotation = 0 }) => ({ width, height, rotation })),
      fields: Object.fromEntries((pdf.fields ?? []).map((f) => [f.name, f.value])),
    };
  },
};
