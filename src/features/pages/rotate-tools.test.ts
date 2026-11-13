import { describe, expect, it } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createPdfSession } from "../../core/session/session.js";
import { rotateLeftTool, rotateRightTool, targetPages } from "./rotate-tools.js";

async function opened() {
  const session = createPdfSession({ engine: createFakeEngine() });
  await session.open(
    encodeFakePdf({ pages: Array.from({ length: 3 }, () => ({ width: 600, height: 800 })) }),
  );
  return session;
}

const context = (session: Awaited<ReturnType<typeof opened>>) => ({
  session,
  chooseFile: () => {},
});

describe("the rotate tools", () => {
  it("act on the selected pages, or the current page when none is selected", async () => {
    const session = await opened();
    expect(targetPages(session.getSnapshot())).toEqual(["p1"]);
    session.select(["p2", "p3"]);
    expect(targetPages(session.getSnapshot())).toEqual(["p2", "p3"]);
  });

  it("turn pages a quarter turn as one undoable step", async () => {
    const session = await opened();
    session.select(["p1", "p3"]);
    await rotateRightTool.run(context(session));
    expect(session.getSnapshot().plan.pages.map((page) => page.rotation)).toEqual([90, 0, 90]);
    await rotateLeftTool.run(context(session));
    await rotateLeftTool.run(context(session));
    expect(session.getSnapshot().plan.pages.map((page) => page.rotation)).toEqual([270, 0, 270]);
    session.undo();
    expect(session.getSnapshot().plan.pages.map((page) => page.rotation)).toEqual([0, 0, 0]);
  });

  it("are disabled with no document open", () => {
    const session = createPdfSession({ engine: createFakeEngine() });
    const state = { snapshot: session.getSnapshot() };
    expect(targetPages(state.snapshot)).toEqual([]);
    expect(rotateLeftTool.isEnabled?.(state)).toBe(false);
    expect(rotateRightTool.isEnabled?.(state)).toBe(false);
  });
});
