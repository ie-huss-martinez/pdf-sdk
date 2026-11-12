import { describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf, type FakePdf } from "../../../test/fakes/fake-pdf.js";
import { isPdfError } from "../errors/pdf-error.js";
import type { PdfBytes } from "../model/document.js";
import type { PdfEngine } from "../ports/pdf-engine.js";
import { createPdfSession, type PdfSessionEvent, type PdfSessionOptions } from "./session.js";

const field = { x: 0.1, y: 0.1, width: 0.3, height: 0.05 };

function pdf(pageCount: number, extra: Partial<FakePdf> = {}): Uint8Array<ArrayBuffer> {
  return encodeFakePdf({
    pages: Array.from({ length: pageCount }, (_, index) => ({
      width: 600 + index,
      height: 800,
    })),
    ...extra,
  });
}

/** An engine that counts the documents it opens and destroys. */
function countingEngine() {
  const engine = createFakeEngine();
  const counts = { opened: 0, destroyed: 0 };
  const counting: PdfEngine = {
    async open(source, options) {
      const document = await engine.open(source, options);
      counts.opened += 1;
      return {
        ...document,
        pageCount: document.pageCount,
        getPage: document.getPage.bind(document),
        renderPage: document.renderPage.bind(document),
        getTextContent: document.getTextContent.bind(document),
        getFormFields: document.getFormFields.bind(document),
        getLinks: document.getLinks.bind(document),
        async destroy() {
          counts.destroyed += 1;
          await document.destroy();
        },
      };
    },
    destroy: () => engine.destroy(),
  };
  return { engine: counting, counts };
}

function session(options: Partial<PdfSessionOptions> = {}) {
  const events: PdfSessionEvent[] = [];
  const { engine, counts } = countingEngine();
  const created = createPdfSession({
    engine,
    onEvent: (event) => events.push(event),
    ...options,
  });
  return { session: created, events, counts };
}

const keys = (s: ReturnType<typeof session>["session"]) =>
  s.getSnapshot().plan.pages.map((page) => page.key);

describe("a PDF session", () => {
  it("starts empty, and opens a document as a plan of all its pages", async () => {
    const { session: s, events } = session();
    expect(s.getSnapshot()).toMatchObject({ status: "empty", busy: false, canUndo: false });

    const seen: string[] = [];
    s.subscribe(() => seen.push(s.getSnapshot().status));
    await s.open(pdf(3));

    const snapshot = s.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.sources).toEqual([{ id: "s1", pageCount: 3, byteLength: pdf(3).byteLength }]);
    expect(snapshot.plan.pages).toEqual([
      { key: "p1", source: "s1", pageIndex: 0, rotation: 0, annotations: [] },
      { key: "p2", source: "s1", pageIndex: 1, rotation: 0, annotations: [] },
      { key: "p3", source: "s1", pageIndex: 2, rotation: 0, annotations: [] },
    ]);
    expect(seen).toContain("opening");
    expect(seen.at(-1)).toBe("ready");
    expect(events).toEqual([{ type: "document_opened", pageCount: 3 }]);
  });

  it("keeps the same snapshot object until something changes", async () => {
    const { session: s } = session();
    await s.open(pdf(2));
    const first = s.getSnapshot();
    expect(s.getSnapshot()).toBe(first);
    s.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 });
    expect(s.getSnapshot()).not.toBe(first);
    expect(Object.isFrozen(s.getSnapshot())).toBe(true);
  });

  it("runs commands, groups them into one step, and undoes and redoes them", async () => {
    const { session: s, events } = session();
    await s.open(pdf(3));
    s.execute({ type: "pdf.rotatePages", pages: ["p2"], angle: 90 });
    s.execute([
      { type: "pdf.movePages", pages: ["p3"], to: 0 },
      { type: "pdf.deletePages", pages: ["p1"] },
    ]);
    expect(keys(s)).toEqual(["p3", "p2"]);

    s.undo();
    expect(keys(s)).toEqual(["p1", "p2", "p3"]);
    expect(s.getSnapshot().plan.pages[1]?.rotation).toBe(90);
    s.undo();
    expect(s.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    expect(s.getSnapshot().plan.pages[1]?.rotation).toBe(0);
    s.redo();
    s.redo();
    expect(keys(s)).toEqual(["p3", "p2"]);
    expect(s.getSnapshot().canRedo).toBe(false);

    expect(events.map((event) => event.type)).toEqual([
      "document_opened",
      "command",
      "command",
      "undo",
      "undo",
      "redo",
      "redo",
    ]);
    expect(events[2]).toEqual({ type: "command", commands: ["pdf.movePages", "pdf.deletePages"] });
  });

  it("drops what could be redone when a new command runs", async () => {
    const { session: s } = session();
    await s.open(pdf(2));
    s.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 });
    s.undo();
    s.execute({ type: "pdf.rotatePages", pages: ["p2"], angle: 90 });
    expect(s.getSnapshot().canRedo).toBe(false);
  });

  it("changes nothing, and records nothing, for a command that doesn't fit", async () => {
    const { session: s } = session();
    await s.open(pdf(2));
    const before = s.getSnapshot();
    expect(() => s.execute({ type: "pdf.deletePages", pages: ["p1", "p2"] })).toThrow(RangeError);
    expect(() => s.execute({ type: "pdf.rotatePages", pages: ["nope"], angle: 90 })).toThrow(
      TypeError,
    );
    expect(s.getSnapshot()).toBe(before);
  });

  it("inserts another document's pages as one undoable step, with the same keys on redo", async () => {
    const { session: s, events } = session();
    await s.open(pdf(2));
    await s.insert(pdf(3), { at: 1, pageIndexes: [2, 0] });
    expect(
      s.getSnapshot().plan.pages.map(({ key, source, pageIndex }) => [key, source, pageIndex]),
    ).toEqual([
      ["p1", "s1", 0],
      ["p3", "s2", 2],
      ["p4", "s2", 0],
      ["p2", "s1", 1],
    ]);
    expect(s.getSnapshot().sources.map((source) => source.id)).toEqual(["s1", "s2"]);

    s.undo();
    expect(keys(s)).toEqual(["p1", "p2"]);
    s.redo();
    expect(keys(s)).toEqual(["p1", "p3", "p4", "p2"]);
    expect(events).toContainEqual({ type: "pages_inserted", pageCount: 2 });
  });

  it("reads plan pages with their added rotation, and forms with the session's values", async () => {
    const { session: s } = session();
    await s.open(
      pdf(1, {
        fields: [
          { name: "name", type: "text", page: 0, rect: field, value: "" },
          { name: "agree", type: "checkbox", page: 0, rect: field, value: false },
        ],
      }),
    );
    s.execute([
      { type: "pdf.rotatePages", pages: ["p1"], angle: 270 },
      { type: "pdf.setFieldValue", source: "s1", field: "name", value: "Ada" },
    ]);
    await expect(s.getPage("p1")).resolves.toEqual({ width: 600, height: 800, rotation: 270 });
    const fields = await s.getFormFields("p1");
    expect(fields.map(({ name, value }) => [name, value])).toEqual([
      ["name", "Ada"],
      ["agree", false],
    ]);

    // The plan's rotation reaches the engine: a 270° page renders sideways.
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" },
    } as unknown as HTMLCanvasElement;
    await s.renderPage("p1", canvas, { scale: 1 });
    expect(canvas.style.width).toBe("800px");
    await expect(s.getPage("missing")).rejects.toThrow(TypeError);
  });

  it("reports a failed open, with nothing open, as the error status", async () => {
    const { session: s, events } = session();
    await expect(s.open(new TextEncoder().encode("not a PDF"))).rejects.toSatisfy((error) =>
      isPdfError(error, "INVALID_PDF"),
    );
    expect(s.getSnapshot()).toMatchObject({ status: "error", busy: false });
    expect(s.getSnapshot().error?.code).toBe("INVALID_PDF");
    expect(events).toEqual([{ type: "failed", operation: "open", code: "INVALID_PDF" }]);
  });

  it("keeps the open document, and its history, when another fails to open", async () => {
    const { session: s } = session();
    await s.open(pdf(2));
    s.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 });
    await expect(s.open(pdf(1, { password: "secret" }))).rejects.toSatisfy((error) =>
      isPdfError(error, "PASSWORD_REQUIRED"),
    );
    expect(s.getSnapshot()).toMatchObject({ status: "ready", canUndo: true });
    expect(s.getSnapshot().error?.code).toBe("PASSWORD_REQUIRED");
    expect(keys(s)).toEqual(["p1", "p2"]);
  });

  it("replaces the document and its history when another opens", async () => {
    const { session: s, counts } = session();
    await s.open(pdf(2));
    s.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 });
    await s.open(pdf(1));
    expect(s.getSnapshot()).toMatchObject({ canUndo: false, sources: [{ id: "s2" }] });
    expect(keys(s)).toEqual(["p3"]);
    expect(counts.destroyed).toBe(1);
  });

  it("checks a file's size before reading it (ADR 0020)", async () => {
    const { session: s } = session({ filePolicy: { maxFileSize: 10 } });
    const file = new Blob([pdf(1)]);
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(s.open(file)).rejects.toSatisfy((error) => isPdfError(error, "FILE_TOO_LARGE"));
    expect(read).not.toHaveBeenCalled();
  });

  it("enforces the page and file limits, and warns from their thresholds", async () => {
    const { session: s } = session({
      filePolicy: { maxPages: { maximum: 4, warning: 3 }, maxFiles: 2 },
    });
    await expect(s.open(pdf(5))).rejects.toSatisfy((error) => isPdfError(error, "TOO_MANY_PAGES"));
    await s.open(pdf(2));
    expect(s.getSnapshot().warnings).toEqual([]);
    await expect(s.insert(pdf(3))).rejects.toSatisfy((error) =>
      isPdfError(error, "TOO_MANY_PAGES"),
    );
    await s.insert(pdf(1));
    expect(s.getSnapshot().warnings).toEqual([{ limit: "maxPages", actual: 3 }]);
    await expect(s.insert(pdf(1))).rejects.toSatisfy((error) =>
      isPdfError(error, "TOO_MANY_FILES"),
    );
    expect(keys(s)).toHaveLength(3);
  });

  it("cancels an open that a newer open replaces", async () => {
    const { engine } = countingEngine();
    // Opens wait until released, and honour their abort signal, as the
    // engine contract requires.
    const pending: Array<() => void> = [];
    const slow: PdfEngine = {
      async open(source, options) {
        await new Promise<void>((resolve, reject) => {
          pending.push(resolve);
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        });
        return engine.open(source, options);
      },
      destroy: () => engine.destroy(),
    };
    const s = createPdfSession({ engine: slow });
    const first = s.open(pdf(3));
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const second = s.open(pdf(1));
    await expect(first).rejects.toSatisfy((error) => isPdfError(error, "ABORTED"));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]?.();
    await second;
    expect(s.getSnapshot()).toMatchObject({ status: "ready", error: undefined, busy: false });
    expect(keys(s)).toHaveLength(1);
  });

  it("rejects an open aborted by its caller", async () => {
    const { session: s } = session();
    const controller = new AbortController();
    controller.abort();
    await expect(s.open(pdf(1), { signal: controller.signal })).rejects.toSatisfy((error) =>
      isPdfError(error, "ABORTED"),
    );
  });

  it("needs an open document before inserting", async () => {
    const { session: s } = session();
    await expect(s.insert(pdf(1))).rejects.toBeInstanceOf(Error);
  });

  it("closes the document and releases every source", async () => {
    const { session: s, counts, events } = session();
    await s.open(pdf(2));
    await s.insert(pdf(1));
    await s.close();
    expect(s.getSnapshot()).toMatchObject({ status: "empty", sources: [], canUndo: false });
    expect(counts.destroyed).toBe(2);
    expect(events.at(-1)).toEqual({ type: "document_closed" });
  });

  it("keeps working when the host's event handler throws", async () => {
    const s = createPdfSession({
      engine: createFakeEngine(),
      onEvent: () => {
        throw new Error("analytics down");
      },
    });
    await s.open(pdf(1));
    expect(s.getSnapshot().status).toBe("ready");
  });

  it("never puts document data in events", async () => {
    const { session: s, events } = session();
    const bytes: PdfBytes = pdf(1, {
      fields: [{ name: "secret-field", type: "text", page: 0, rect: field, value: "" }],
    });
    await s.open(bytes);
    s.execute({
      type: "pdf.setFieldValue",
      source: "s1",
      field: "secret-field",
      value: "my password",
    });
    expect(JSON.stringify(events)).not.toMatch(/secret-field|my password/);
  });
});
