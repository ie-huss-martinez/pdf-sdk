import { describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createPdfSession } from "../../core/session/session.js";
import { insertPagesTool } from "./insert-tool.js";

describe("the insert tool (docs/adr/0008)", () => {
  it("is enabled with a document open, and not while an insert runs", async () => {
    const session = createPdfSession({ engine: createFakeEngine() });
    expect(insertPagesTool.isEnabled?.({ snapshot: session.getSnapshot() })).toBe(false);
    await session.open(encodeFakePdf({ pages: [{ width: 600, height: 800 }] }));
    const snapshot = session.getSnapshot();
    expect(insertPagesTool.isEnabled?.({ snapshot })).toBe(true);
    expect(insertPagesTool.isEnabled?.({ snapshot, inserting: true })).toBe(false);
  });

  it("asks the editor for a file, and has no shortcut", async () => {
    const session = createPdfSession({ engine: createFakeEngine() });
    const chooseInsertFile = vi.fn();
    await insertPagesTool.run({ session, chooseFile: () => {}, chooseInsertFile });
    expect(chooseInsertFile).toHaveBeenCalledOnce();
    expect(insertPagesTool.shortcuts ?? []).toEqual([]);
  });
});
