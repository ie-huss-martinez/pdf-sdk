import { describe, expect, it } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createPdfSession } from "../../core/session/session.js";
import { moveEarlierTool, moveLaterTool, moveOf } from "./move-tools.js";

async function opened(pageCount = 5) {
  const session = createPdfSession({ engine: createFakeEngine() });
  await session.open(
    encodeFakePdf({
      pages: Array.from({ length: pageCount }, () => ({ width: 600, height: 800 })),
    }),
  );
  return session;
}

type Session = Awaited<ReturnType<typeof opened>>;
const keys = (session: Session) => session.getSnapshot().plan.pages.map((page) => page.key);
const context = (session: Session) => ({ session, chooseFile: () => {} });
const enabled = (session: Session) => ({
  earlier: moveEarlierTool.isEnabled?.({ snapshot: session.getSnapshot() }),
  later: moveLaterTool.isEnabled?.({ snapshot: session.getSnapshot() }),
});

describe("the move tools (docs/adr/0008)", () => {
  it.each([
    // [selection, direction, resulting order]
    [["p3"], "earlier", ["p1", "p3", "p2", "p4", "p5"]],
    [["p3"], "later", ["p1", "p2", "p4", "p3", "p5"]],
    [["p2", "p3"], "earlier", ["p2", "p3", "p1", "p4", "p5"]],
    [["p2", "p3"], "later", ["p1", "p4", "p2", "p3", "p5"]],
    // Scattered pages are gathered into one block, in plan order.
    [["p2", "p4"], "earlier", ["p2", "p4", "p1", "p3", "p5"]],
    [["p2", "p4"], "later", ["p1", "p3", "p5", "p2", "p4"]],
    [["p1", "p3"], "earlier", ["p1", "p3", "p2", "p4", "p5"]],
    [["p3", "p5"], "later", ["p1", "p2", "p4", "p3", "p5"]],
  ] as const)("moves %j %s to %j", async (selection, direction, order) => {
    const session = await opened();
    session.select(selection);
    const tool = direction === "earlier" ? moveEarlierTool : moveLaterTool;
    await tool.run(context(session));
    expect(keys(session)).toEqual(order);
    expect(session.getSnapshot().selection).toEqual(selection);
  });

  it("moves the current page when none is selected, and keeps it current", async () => {
    const session = await opened(3);
    session.goToPage("p2");
    await moveLaterTool.run(context(session));
    expect(keys(session)).toEqual(["p1", "p3", "p2"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p2"], currentPage: "p2" });
    expect(session.getSnapshot().navigation?.page).toBe("p2");
  });

  it("keeps the current page current if it moved, or makes the first moved page current", async () => {
    const session = await opened();
    session.select(["p3", "p4"]);
    session.setCurrentPage("p4");
    await moveEarlierTool.run(context(session));
    expect(session.getSnapshot().currentPage).toBe("p4");
    session.select(["p5"]);
    session.setCurrentPage("p1");
    await moveEarlierTool.run(context(session));
    expect(session.getSnapshot().currentPage).toBe("p5");
  });

  it("is disabled where a block can't move, and with no document", async () => {
    const empty = createPdfSession({ engine: createFakeEngine() });
    expect(moveOf(empty.getSnapshot(), "earlier")).toBeUndefined();
    expect(moveEarlierTool.isEnabled?.({ snapshot: empty.getSnapshot() })).toBe(false);

    const session = await opened();
    session.select(["p1", "p2"]);
    expect(enabled(session)).toEqual({ earlier: false, later: true });
    session.select(["p4", "p5"]);
    expect(enabled(session)).toEqual({ earlier: true, later: false });
    session.select(["p1", "p2", "p3", "p4", "p5"]);
    expect(enabled(session)).toEqual({ earlier: false, later: false });
    // A scattered selection at an end can still be gathered.
    session.select(["p1", "p3"]);
    expect(enabled(session)).toEqual({ earlier: true, later: true });
    expect(enabled(await opened(1))).toEqual({ earlier: false, later: false });
  });

  it("is one undo step per move, and undo brings back the order and the selection", async () => {
    const session = await opened();
    session.select(["p2", "p4"]);
    await moveEarlierTool.run(context(session));
    session.select(["p1"]);
    session.undo();
    expect(keys(session)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(session.getSnapshot().selection).toEqual(["p2", "p4"]);
    session.redo();
    expect(keys(session)).toEqual(["p2", "p4", "p1", "p3", "p5"]);
    expect(session.getSnapshot().selection).toEqual(["p1"]);
  });
});
