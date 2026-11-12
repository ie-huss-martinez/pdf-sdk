import { describe, expect, it } from "vitest";
import {
  isPdfError,
  type PdfBuildProgress,
  type PdfFieldValue,
  type PdfProcessor,
  type PdfRotation,
} from "../../src/index.js";

/** What a build produced, read back by the harness. */
export interface InspectedPdf {
  readonly pages: readonly {
    readonly width: number;
    readonly height: number;
    readonly rotation: PdfRotation;
  }[];
  /** Every form field's value, by its name in the output. */
  readonly fields: Readonly<Record<string, PdfFieldValue>>;
}

/**
 * What a processor's contract test needs: a way to create the processor,
 * documents to build from, and a way to read the output. The qpdf adapter
 * supplies real PDFs and reads them with pdf-lib; the fakes supply fake ones.
 */
export interface PdfProcessorHarness {
  createProcessor(): PdfProcessor;
  /** A document with one unrotated page of each given size, in points. */
  pages(sizes: readonly { width: number; height: number }[]): Promise<Uint8Array>;
  /** A one-page document with a text field `name` and a checkbox `agree`, both empty. */
  form(): Promise<Uint8Array>;
  /**
   * Reads a built document, opening it with the password when one is given.
   * Rejects when the document is encrypted and no password, or a wrong one,
   * is given.
   */
  inspect(bytes: Uint8Array, password?: string): Promise<InspectedPdf>;
}

const A4 = { width: 595, height: 842 };
const LETTER = { width: 612, height: 792 };
const SQUARE = { width: 400, height: 400 };

/**
 * The behaviour every {@link PdfProcessor} must have (ADR 0003, ADR 0008).
 * Adapters run it with their own harness.
 */
export function describePdfProcessorContract(name: string, harness: PdfProcessorHarness): void {
  describe(`${name}: the PdfProcessor contract`, () => {
    it("builds every page of one source unchanged", async () => {
      const processor = harness.createProcessor();
      const bytes = await harness.pages([A4, LETTER]);
      const output = await processor.build({
        sources: [{ id: "a", bytes }],
        pages: [
          { source: "a", pageIndex: 0 },
          { source: "a", pageIndex: 1 },
        ],
      });
      expect((await harness.inspect(output)).pages).toEqual([
        { ...A4, rotation: 0 },
        { ...LETTER, rotation: 0 },
      ]);
      await processor.destroy();
    });

    it("assembles pages from several sources in plan order, with rotations", async () => {
      const processor = harness.createProcessor();
      const output = await processor.build({
        sources: [
          { id: "a", bytes: await harness.pages([A4, LETTER]) },
          { id: "b", bytes: await harness.pages([SQUARE]) },
        ],
        pages: [
          { source: "a", pageIndex: 1, rotation: 90 },
          { source: "b", pageIndex: 0 },
          { source: "a", pageIndex: 0, rotation: 270 },
          { source: "a", pageIndex: 0 },
        ],
      });
      expect((await harness.inspect(output)).pages).toEqual([
        { ...LETTER, rotation: 90 },
        { ...SQUARE, rotation: 0 },
        { ...A4, rotation: 270 },
        { ...A4, rotation: 0 },
      ]);
      await processor.destroy();
    });

    it("fills each source's form values, keeping fields with the same name apart", async () => {
      const processor = harness.createProcessor();
      const form = await harness.form();
      const output = await processor.build({
        sources: [
          { id: "a", bytes: form, formValues: { name: "Ada", agree: true } },
          { id: "b", bytes: form, formValues: { name: "Grace" } },
        ],
        pages: [
          { source: "a", pageIndex: 0 },
          { source: "b", pageIndex: 0 },
        ],
      });
      const values = Object.values((await harness.inspect(output)).fields);
      expect(values).toEqual(expect.arrayContaining(["Ada", "Grace", true]));
      await processor.destroy();
    });

    it("compresses without changing the pages", async () => {
      const processor = harness.createProcessor();
      const output = await processor.build({
        sources: [{ id: "a", bytes: await harness.pages([A4, SQUARE]) }],
        pages: [
          { source: "a", pageIndex: 0 },
          { source: "a", pageIndex: 1 },
        ],
        compress: {},
      });
      expect((await harness.inspect(output)).pages).toEqual([
        { ...A4, rotation: 0 },
        { ...SQUARE, rotation: 0 },
      ]);
      await processor.destroy();
    });

    it("encrypts with the user password", async () => {
      const processor = harness.createProcessor();
      const output = await processor.build({
        sources: [{ id: "a", bytes: await harness.pages([A4]) }],
        pages: [{ source: "a", pageIndex: 0 }],
        encrypt: { userPassword: "correct horse" },
      });
      await expect(harness.inspect(output)).rejects.toBeDefined();
      await expect(harness.inspect(output, "wrong")).rejects.toBeDefined();
      expect((await harness.inspect(output, "correct horse")).pages).toEqual([
        { ...A4, rotation: 0 },
      ]);
      await processor.destroy();
    });

    it("reports progress that only moves forward and ends at 1", async () => {
      const processor = harness.createProcessor();
      const progress: PdfBuildProgress[] = [];
      await processor.build(
        {
          sources: [{ id: "a", bytes: await harness.pages([A4]) }],
          pages: [{ source: "a", pageIndex: 0 }],
          compress: {},
          encrypt: { userPassword: "secret" },
        },
        { onProgress: (value) => progress.push(value) },
      );
      expect(progress.length).toBeGreaterThan(0);
      const fractions = progress.map((value) => value.fraction);
      expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
      expect(fractions.at(-1)).toBe(1);
      await processor.destroy();
    });

    it("copies the caller's bytes, and returns a buffer of its own", async () => {
      const processor = harness.createProcessor();
      const bytes = await harness.pages([A4]);
      const before = [...bytes];
      const output = await processor.build({
        sources: [{ id: "a", bytes }],
        pages: [{ source: "a", pageIndex: 0 }],
      });
      expect(bytes.byteLength).toBe(before.length);
      expect([...bytes]).toEqual(before);
      expect(output.buffer).not.toBe(bytes.buffer);
      expect(output.byteOffset).toBe(0);
      expect(output.byteLength).toBe(output.buffer.byteLength);
      await processor.destroy();
    });

    it("rejects a job that refers to an unknown source or page", async () => {
      const processor = harness.createProcessor();
      const bytes = await harness.pages([A4]);
      await expect(
        processor.build({ sources: [{ id: "a", bytes }], pages: [{ source: "b", pageIndex: 0 }] }),
      ).rejects.toThrow(TypeError);
      await expect(
        processor.build({ sources: [{ id: "a", bytes }], pages: [{ source: "a", pageIndex: 1 }] }),
      ).rejects.toThrow(RangeError);
      await processor.destroy();
    });

    it("rejects a source that isn't a PDF with INVALID_PDF", async () => {
      const processor = harness.createProcessor();
      await expect(
        processor.build({
          sources: [{ id: "a", bytes: new TextEncoder().encode("not a PDF") }],
          pages: [{ source: "a", pageIndex: 0 }],
        }),
      ).rejects.toSatisfy((error) => isPdfError(error, "INVALID_PDF"));
      await processor.destroy();
    });

    it("rejects an aborted build with ABORTED", async () => {
      const processor = harness.createProcessor();
      const controller = new AbortController();
      controller.abort();
      await expect(
        processor.build(
          {
            sources: [{ id: "a", bytes: await harness.pages([A4]) }],
            pages: [{ source: "a", pageIndex: 0 }],
          },
          { signal: controller.signal },
        ),
      ).rejects.toSatisfy((error) => isPdfError(error, "ABORTED"));
      await processor.destroy();
    });

    it("rejects builds after it's destroyed", async () => {
      const processor = harness.createProcessor();
      const bytes = await harness.pages([A4]);
      await processor.destroy();
      await expect(
        processor.build({ sources: [{ id: "a", bytes }], pages: [{ source: "a", pageIndex: 0 }] }),
      ).rejects.toBeDefined();
    });
  });
}
