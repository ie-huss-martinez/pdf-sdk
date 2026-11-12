import { describe, expect, it } from "vitest";
import {
  isPdfError,
  PDF_MAX_CANVAS_PIXELS,
  type PdfEngine,
  type PdfFieldValue,
  type PdfPageInfo,
} from "../../src/index.js";

/**
 * What an engine's contract test needs: a way to create the engine, and
 * documents whose contents are known. The pdf.js adapter supplies real PDFs;
 * the fakes supply fake ones.
 */
export interface PdfEngineHarness {
  createEngine(): PdfEngine;
  /**
   * A document with at least two pages of different sizes, text on its
   * first page, and a text field and a checkbox on its first page.
   */
  document(): Promise<Uint8Array>;
  /** What {@link PdfEngineHarness.document} contains. */
  readonly expected: {
    readonly pages: readonly PdfPageInfo[];
    /** Text that appears on the first page. */
    readonly firstPageText: string;
    /**
     * The URLs of the first page's links that the engine must report. The
     * document must also have links it must leave out: `javascript:`, `ftp:`,
     * `tel:` and relative ones.
     */
    readonly firstPageLinks: readonly string[];
    /** The first page's fields, by name. */
    readonly firstPageFields: Readonly<
      Record<string, { readonly type: "text" | "checkbox"; readonly value: PdfFieldValue }>
    >;
  };
  /** A document encrypted with a user password. */
  encrypted(): Promise<Uint8Array>;
  /** Whether the environment can render to a canvas. */
  readonly canRender: boolean;
}

/**
 * The behaviour every {@link PdfEngine} must have (ADR 0008). Adapters run
 * it with their own harness.
 */
export function describePdfEngineContract(name: string, harness: PdfEngineHarness): void {
  describe(`${name}: the PdfEngine contract`, () => {
    async function open(bytes?: Uint8Array) {
      const engine = harness.createEngine();
      const document = await engine.open(bytes ?? (await harness.document()));
      return { engine, document };
    }

    it("opens a document and reports its pages", async () => {
      const { engine, document } = await open();
      expect(document.pageCount).toBe(harness.expected.pages.length);
      for (const [index, page] of harness.expected.pages.entries()) {
        await expect(document.getPage(index)).resolves.toEqual(page);
      }
      await engine.destroy();
    });

    it("copies the caller's bytes, including a view into a larger buffer", async () => {
      const bytes = await harness.document();
      const heap = new Uint8Array(bytes.length + 8);
      heap.set(bytes, 4);
      const view = heap.subarray(4, 4 + bytes.length);
      const before = [...view];

      const engine = harness.createEngine();
      const document = await engine.open(view);
      expect(document.pageCount).toBe(harness.expected.pages.length);
      expect(heap.buffer.byteLength).toBe(bytes.length + 8);
      expect([...view]).toEqual(before);
      await engine.destroy();
    });

    it("reads a page's text", async () => {
      const { engine, document } = await open();
      const { items } = await document.getTextContent(0);
      expect(items.map((item) => item.text).join(" ")).toContain(harness.expected.firstPageText);
      for (const { rect } of items) {
        for (const value of [rect.x, rect.y, rect.width, rect.height]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
      await engine.destroy();
    });

    it("reads a page's form fields", async () => {
      const { engine, document } = await open();
      const fields = await document.getFormFields(0);
      const byName = Object.fromEntries(
        fields.map((field) => [field.name, { type: field.type, value: field.value }]),
      );
      expect(byName).toEqual(harness.expected.firstPageFields);
      await engine.destroy();
    });

    it("reads a page's web and email links, and leaves out every other kind (ADR 0012)", async () => {
      const { engine, document } = await open();
      const links = await document.getLinks(0);
      expect(links.map((link) => link.url).sort()).toEqual(
        [...harness.expected.firstPageLinks].sort(),
      );
      for (const { rect } of links) {
        for (const value of [rect.x, rect.y, rect.width, rect.height]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(rect.width).toBeGreaterThan(0);
      }
      await engine.destroy();
    });

    it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
      "rejects page index %s with a RangeError",
      async (index) => {
        const { engine, document } = await open();
        await expect(document.getPage(index)).rejects.toThrow(RangeError);
        await expect(document.getTextContent(index)).rejects.toThrow(RangeError);
        await expect(document.getFormFields(index)).rejects.toThrow(RangeError);
        await expect(document.getLinks(index)).rejects.toThrow(RangeError);
        await engine.destroy();
      },
    );

    it("rejects a file that isn't a PDF with INVALID_PDF", async () => {
      const engine = harness.createEngine();
      const garbage = new TextEncoder().encode("this is not a PDF at all");
      await expect(engine.open(garbage)).rejects.toSatisfy((error) =>
        isPdfError(error, "INVALID_PDF"),
      );
      await engine.destroy();
    });

    it("rejects an encrypted PDF with PASSWORD_REQUIRED", async () => {
      const engine = harness.createEngine();
      await expect(engine.open(await harness.encrypted())).rejects.toSatisfy((error) =>
        isPdfError(error, "PASSWORD_REQUIRED"),
      );
      await engine.destroy();
    });

    it("rejects an aborted open with ABORTED, or with the reason's code", async () => {
      const engine = harness.createEngine();
      const bytes = await harness.document();
      const controller = new AbortController();
      controller.abort();
      await expect(engine.open(bytes, { signal: controller.signal })).rejects.toSatisfy((error) =>
        isPdfError(error, "ABORTED"),
      );
      await expect(
        engine.open(bytes, { signal: AbortSignal.abort(new DOMException("", "TimeoutError")) }),
      ).rejects.toSatisfy((error) => isPdfError(error, "TIMEOUT"));
      await engine.destroy();
    });

    it("rejects calls after the document is destroyed", async () => {
      const { engine, document } = await open();
      await document.destroy();
      await expect(document.getPage(0)).rejects.toBeDefined();
      await engine.destroy();
    });

    it.runIf(harness.canRender)(
      "renders a page at the requested size, with the added rotation",
      async () => {
        const { engine, document } = await open();
        const page = harness.expected.pages[0] as PdfPageInfo;
        const canvas = window.document.createElement("canvas");

        await document.renderPage(0, canvas, { scale: 0.5, pixelRatio: 2 });
        const upright = page.rotation === 90 || page.rotation === 270;
        const width = (upright ? page.height : page.width) * 0.5;
        expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(width, 0);
        expect(canvas.width).toBeGreaterThanOrEqual(Math.floor(width * 2) - 1);
        expect(canvas.width).toBeLessThanOrEqual(Math.ceil(width * 2) + 1);

        await document.renderPage(0, canvas, { scale: 0.5, rotation: 90 });
        const turned = (upright ? page.width : page.height) * 0.5;
        expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(turned, 0);
        await engine.destroy();
      },
    );

    it.runIf(harness.canRender)("never draws a canvas larger than the cap", async () => {
      const { engine, document } = await open();
      const canvas = window.document.createElement("canvas");
      await document.renderPage(0, canvas, { scale: 20, pixelRatio: 3 });
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(PDF_MAX_CANVAS_PIXELS);
      await engine.destroy();
    });
  });
}
