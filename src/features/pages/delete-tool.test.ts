import { describe, expect, it } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createPdfSession } from "../../core/session/session.js";
import { deletePagesTool } from "./delete-tool.js";

async function opened(pageCount = 5) {
  const session = createPdfSession({ engine: createFakeEngine() });
  await session.open(
    encodeFakePdf({
      pages: Array.from({ length: pageCount }, () => ({ width: 600, height: 800 })),
    }),
  );
  return session;
}

const run = (session: Awaited<ReturnType<typeof opened>>) =>
  deletePagesTool.run({ session, chooseFile: () => {} });
const keys = (session: Awaited<ReturnType<typeof opened>>) =>
  session.getSnapshot().plan.pages.map((page) => page.key);
const enabled = (session: Awaited<ReturnType<typeof opened>>) =>
  deletePagesTool.isEnabled?.({ snapshot: session.getSnapshot() });

describe("the delete tool (docs/adr/0008)", () => {
  it("deletes the selected pages, and selects the page that takes the first one's place", async () => {
    const session = await opened();
    session.select(["p2", "p4"]);
    await run(session);
    expect(keys(session)).toEqual(["p1", "p3", "p5"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p3"], currentPage: "p3" });
    expect(session.getSnapshot().navigation?.page).toBe("p3");
  });

  it("deletes the current page when none is selected", async () => {
    const session = await opened(3);
    session.goToPage("p2");
    await run(session);
    expect(keys(session)).toEqual(["p1", "p3"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p3"], currentPage: "p3" });
  });

  it("selects the new last page when the deleted pages were at the end", async () => {
    const session = await opened();
    session.select(["p4", "p5"]);
    await run(session);
    expect(keys(session)).toEqual(["p1", "p2", "p3"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p3"], currentPage: "p3" });
  });

  it("keeps at least one page: it's disabled when every page is a target", async () => {
    const session = await opened(2);
    expect(enabled(session)).toBe(true);
    session.select(["p1", "p2"]);
    expect(enabled(session)).toBe(false);
    await run(session);
    expect(keys(session)).toEqual(["p1", "p2"]);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it("is disabled with no document, or a one-page document", async () => {
    const empty = createPdfSession({ engine: createFakeEngine() });
    expect(deletePagesTool.isEnabled?.({ snapshot: empty.getSnapshot() })).toBe(false);
    expect(enabled(await opened(1))).toBe(false);
  });

  it("is one undo step, and undo brings back the pages, the selection and the current page", async () => {
    const session = await opened();
    session.select(["p2", "p4"]);
    session.setCurrentPage("p2");
    await run(session);
    session.undo();
    expect(keys(session)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p2", "p4"], currentPage: "p2" });
    expect(session.getSnapshot().navigation?.page).toBe("p2");
    session.redo();
    expect(keys(session)).toEqual(["p1", "p3", "p5"]);
    expect(session.getSnapshot()).toMatchObject({ selection: ["p3"], currentPage: "p3" });
  });
});
