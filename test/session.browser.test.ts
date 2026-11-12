import { describe, expect, it } from "vitest";
import { createPdfJsEngine, createPdfProcessor, createPdfSession } from "../src/index.js";
import { inspectPdf } from "./fixtures/inspect.js";
import { pagesPdf } from "./fixtures/pdfs.js";

describe("a session with the pdf.js engine", () => {
  it("opens, edits, undoes and renders a real document", async () => {
    const engine = createPdfJsEngine();
    const session = createPdfSession({ engine });
    await session.open(
      await pagesPdf([
        { width: 612, height: 792 },
        { width: 400, height: 300 },
      ]),
    );
    await session.insert(new Blob([await pagesPdf([{ width: 200, height: 100 }])]), { at: 0 });

    const [inserted, first, second] = session.getSnapshot().plan.pages;
    session.execute([
      { type: "pdf.rotatePages", pages: [second?.key as string], angle: 90 },
      { type: "pdf.deletePages", pages: [first?.key as string] },
    ]);
    expect(session.getSnapshot().plan.pages.map((page) => page.key)).toEqual([
      inserted?.key,
      second?.key,
    ]);

    // The plan's rotation reaches pdf.js: the landscape page renders upright.
    const canvas = document.createElement("canvas");
    await session.renderPage(second?.key as string, canvas, { scale: 1 });
    expect([canvas.style.width, canvas.style.height]).toEqual(["300px", "400px"]);
    await expect(session.getPage(second?.key as string)).resolves.toEqual({
      width: 400,
      height: 300,
      rotation: 90,
    });

    session.undo();
    session.undo();
    expect(session.getSnapshot().plan.pages).toHaveLength(2);
    await session.close();
    await engine.destroy();
  });

  it("exports the plan through the qpdf processor", async () => {
    const engine = createPdfJsEngine();
    const processor = createPdfProcessor();
    const session = createPdfSession({ engine, processor });
    await session.open(
      await pagesPdf([
        { width: 612, height: 792 },
        { width: 400, height: 300 },
      ]),
    );
    await session.insert(await pagesPdf([{ width: 200, height: 100 }]), { at: 1 });
    const [first, inserted, last] = session.getSnapshot().plan.pages;
    session.execute([
      { type: "pdf.rotatePages", pages: [last?.key as string], angle: 90 },
      { type: "pdf.movePages", pages: [last?.key as string], to: 0 },
    ]);
    expect([first, inserted].every(Boolean)).toBe(true);

    const output = await session.export({ compress: {}, encrypt: { userPassword: "secret" } });
    expect((await inspectPdf(output, "secret")).pages).toEqual([
      { width: 400, height: 300, rotation: 90 },
      { width: 612, height: 792, rotation: 0 },
      { width: 200, height: 100, rotation: 0 },
    ]);
    await session.close();
    await Promise.all([engine.destroy(), processor.destroy()]);
  });
});
