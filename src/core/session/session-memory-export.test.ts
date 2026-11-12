import { describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { decodeFakePdf, encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createFakeProcessor } from "../../../test/fakes/fake-processor.js";
import { isPdfError, PdfError } from "../errors/pdf-error.js";
import type { PdfEngine } from "../ports/pdf-engine.js";
import type { PdfProcessor } from "../ports/pdf-processor.js";
import { createPdfSession, type PdfSessionEvent, type PdfSessionOptions } from "./session.js";

/** A fake PDF of exactly `size` bytes, so memory sums are easy to read. */
function sized(size: number, width = 600): Uint8Array<ArrayBuffer> {
  const base = encodeFakePdf({ pages: [{ width, height: 800, text: "" }] });
  const padding = size - base.length;
  if (padding < 0) throw new Error(`A fake PDF needs at least ${base.length} bytes.`);
  return encodeFakePdf({ pages: [{ width, height: 800, text: "x".repeat(padding) }] });
}

function setup(options: Partial<PdfSessionOptions> = {}, { withProcessor = true } = {}) {
  const engine = createFakeEngine();
  const destroyed: number[] = [];
  let opened = 0;
  const counting: PdfEngine = {
    async open(source, callOptions) {
      const document = await engine.open(source, callOptions);
      opened += 1;
      const id = opened;
      return {
        pageCount: document.pageCount,
        getPage: document.getPage.bind(document),
        renderPage: document.renderPage.bind(document),
        getTextContent: document.getTextContent.bind(document),
        getFormFields: document.getFormFields.bind(document),
        getLinks: document.getLinks.bind(document),
        destroy: async () => {
          destroyed.push(id);
          await document.destroy();
        },
      };
    },
    destroy: () => engine.destroy(),
  };
  const events: PdfSessionEvent[] = [];
  const session = createPdfSession({
    engine: counting,
    ...(withProcessor ? { processor: createFakeProcessor() } : {}),
    onEvent: (event) => events.push(event),
    ...options,
  });
  const keys = () => session.getSnapshot().plan.pages.map((page) => page.key);
  return { session, destroyed, events, keys };
}

describe("the session's memory (docs/adr/0004)", () => {
  it("counts every held document, and releases one nothing refers to any more", async () => {
    const { session, destroyed, keys } = setup();
    await session.open(sized(300));
    await session.insert(sized(200));
    expect(session.getSnapshot().sessionBytes).toBe(500);

    // Undone, the insert can still be redone, so its document is held...
    session.undo();
    expect(session.getSnapshot().sessionBytes).toBe(500);
    // ...until a new edit drops the redo step.
    session.execute({ type: "pdf.rotatePages", pages: keys(), angle: 90 });
    await vi.waitFor(() => expect(destroyed).toEqual([2]));
    expect(session.getSnapshot().sources.map((source) => source.id)).toEqual(["s1"]);
    expect(session.getSnapshot().sessionBytes).toBe(300);
  });

  it("keeps a deleted document while undo can bring its pages back", async () => {
    const { session, keys } = setup();
    await session.open(sized(300));
    await session.insert(sized(200));
    session.execute({ type: "pdf.deletePages", pages: [keys()[1] as string] });
    expect(session.getSnapshot().sessionBytes).toBe(500);
  });

  it("drops the oldest undo steps to make room for an insert, and says so", async () => {
    const { session, destroyed, keys } = setup({ filePolicy: { maxSessionSize: 750 } });
    await session.open(sized(300));
    await session.insert(sized(200));
    // Only the history refers to the inserted document now.
    session.execute({ type: "pdf.deletePages", pages: [keys()[1] as string] });
    session.execute({ type: "pdf.rotatePages", pages: [keys()[0] as string], angle: 90 });

    await session.insert(sized(400));
    expect(session.getSnapshot()).toMatchObject({ sessionBytes: 700, historyTrimmed: true });
    await vi.waitFor(() => expect(destroyed).toContain(2));
    // The insert and the delete were dropped; the rotation and the new insert remain.
    session.undo();
    session.undo();
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().plan.pages[0]?.rotation).toBe(0);
  });

  it("drops redo steps before undo steps", async () => {
    const { session } = setup({ filePolicy: { maxSessionSize: 750 } });
    await session.open(sized(300));
    await session.insert(sized(200));
    session.undo();
    await session.insert(sized(400));
    expect(session.getSnapshot()).toMatchObject({
      canRedo: false,
      canUndo: true,
      sessionBytes: 700,
    });
  });

  it("rejects an insert that can't fit even without history, and changes nothing", async () => {
    const { session, keys } = setup({ filePolicy: { maxSessionSize: 650 } });
    await session.open(sized(300));
    session.execute({ type: "pdf.rotatePages", pages: keys(), angle: 90 });
    const before = keys();
    await expect(session.insert(sized(400))).rejects.toSatisfy(
      (error) =>
        isPdfError(error, "SESSION_TOO_LARGE") &&
        (error.details as { actual?: number } | undefined)?.actual === 700,
    );
    expect(session.getSnapshot()).toMatchObject({
      canUndo: true,
      historyTrimmed: false,
      sessionBytes: 300,
    });
    expect(keys()).toEqual(before);
  });

  it("rejects opening a document larger than the session limit", async () => {
    const { session } = setup({ filePolicy: { maxSessionSize: 250 } });
    await expect(session.open(sized(300))).rejects.toSatisfy((error) =>
      isPdfError(error, "SESSION_TOO_LARGE"),
    );
  });

  it("warns from the session size threshold", async () => {
    const { session } = setup({ filePolicy: { maxSessionSize: { maximum: 1000, warning: 400 } } });
    await session.open(sized(300));
    expect(session.getSnapshot().warnings).toEqual([]);
    await session.insert(sized(200));
    expect(session.getSnapshot().warnings).toEqual([{ limit: "maxSessionSize", actual: 500 }]);
  });
});

describe("exporting a session", () => {
  it("returns an unchanged document as its original bytes, without the processor", async () => {
    const processor: PdfProcessor = { build: vi.fn(), destroy: vi.fn() };
    const { session, events } = setup({ processor });
    const bytes = sized(300);
    await session.open(bytes);
    const output = await session.export();
    expect([...output]).toEqual([...bytes]);
    expect(output.buffer).not.toBe(bytes.buffer);
    expect(processor.build).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: "document_exported",
      pageCount: 1,
      compressed: false,
      encrypted: false,
    });
  });

  it("builds the plan: pages in order, rotations, form values and annotations", async () => {
    const processor = createFakeProcessor();
    const build = vi.spyOn(processor, "build");
    const { session, keys } = setup({ processor });
    await session.open(
      encodeFakePdf({
        pages: [
          { width: 100, height: 100 },
          { width: 200, height: 200 },
        ],
        fields: [
          {
            name: "name",
            type: "text",
            page: 0,
            rect: { x: 0, y: 0, width: 1, height: 1 },
            value: "",
          },
        ],
      }),
    );
    await session.insert(sized(200, 300));
    const [first, second, third] = keys();
    session.execute([
      { type: "pdf.movePages", pages: [third as string], to: 0 },
      { type: "pdf.rotatePages", pages: [first as string], angle: 90 },
      { type: "pdf.deletePages", pages: [second as string] },
      { type: "pdf.setFieldValue", source: "s1", field: "name", value: "Ada" },
      {
        type: "pdf.addAnnotation",
        page: first as string,
        annotation: {
          id: "n",
          type: "text",
          at: { x: 0, y: 0 },
          text: "Hi",
          size: 0.02,
          color: "#000000",
        },
      },
    ]);

    const progress: number[] = [];
    const output = await session.export({
      compress: {},
      encrypt: { userPassword: "secret" },
      onProgress: ({ fraction }) => progress.push(fraction),
    });

    expect(build.mock.calls[0]?.[0]).toMatchObject({
      sources: [{ id: "s2" }, { id: "s1", formValues: { name: "Ada" } }],
      pages: [
        { source: "s2", pageIndex: 0 },
        { source: "s1", pageIndex: 0, rotation: 90, annotations: [{ id: "n" }] },
      ],
      compress: {},
      encrypt: { userPassword: "secret" },
    });
    const built = decodeFakePdf(output);
    expect(built?.pages.map(({ width, rotation, drawn }) => [width, rotation, drawn])).toEqual([
      [300, 0, 0],
      [100, 90, 1],
    ]);
    expect(built?.fields?.[0]?.value).toBe("Ada");
    expect(progress.at(-1)).toBe(1);
  });

  it("needs a processor to export an edited document", async () => {
    const { session, keys } = setup({}, { withProcessor: false });
    await session.open(sized(300));
    session.execute({ type: "pdf.rotatePages", pages: keys(), angle: 90 });
    await expect(session.export()).rejects.toThrow(TypeError);
  });

  it("reports a failed export as a PdfError, and an event with its code only", async () => {
    const processor: PdfProcessor = {
      build: vi.fn().mockRejectedValue(new PdfError("PASSWORD_REQUIRED", "Encrypted.")),
      destroy: vi.fn(),
    };
    const { session, events, keys } = setup({ processor });
    await session.open(sized(300));
    session.execute({ type: "pdf.rotatePages", pages: keys(), angle: 90 });
    await expect(session.export()).rejects.toSatisfy((error) =>
      isPdfError(error, "PASSWORD_REQUIRED"),
    );
    expect(events.at(-1)).toEqual({
      type: "failed",
      operation: "export",
      code: "PASSWORD_REQUIRED",
    });
    expect(session.getSnapshot().busy).toBe(false);
  });

  it("rejects an export aborted by its caller", async () => {
    const { session, keys } = setup();
    await session.open(sized(300));
    session.execute({ type: "pdf.rotatePages", pages: keys(), angle: 90 });
    await expect(session.export({ signal: AbortSignal.abort() })).rejects.toSatisfy((error) =>
      isPdfError(error, "ABORTED"),
    );
  });

  it("needs an open document", async () => {
    const { session } = setup();
    await expect(session.export()).rejects.toSatisfy((error) => isPdfError(error));
  });
});
