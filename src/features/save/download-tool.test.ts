import { describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createPdfSession } from "../../core/session/session.js";
import { downloadTool } from "./download-tool.js";

describe("the download tool (docs/adr/0009)", () => {
  it("is enabled with a document open, and not while a save runs", async () => {
    const session = createPdfSession({ engine: createFakeEngine() });
    expect(downloadTool.isEnabled?.({ snapshot: session.getSnapshot() })).toBe(false);
    await session.open(encodeFakePdf({ pages: [{ width: 600, height: 800 }] }));
    const snapshot = session.getSnapshot();
    expect(downloadTool.isEnabled?.({ snapshot })).toBe(true);
    expect(downloadTool.isEnabled?.({ snapshot, saving: false })).toBe(true);
    expect(downloadTool.isEnabled?.({ snapshot, saving: true })).toBe(false);
  });

  it("asks the editor to save, and has no shortcut", async () => {
    const session = createPdfSession({ engine: createFakeEngine() });
    const save = vi.fn();
    await downloadTool.run({ session, chooseFile: () => {}, save });
    expect(save).toHaveBeenCalledOnce();
    expect(downloadTool.shortcuts ?? []).toEqual([]);
    // Outside the editor there's no save to run, and nothing happens.
    await expect(
      Promise.resolve(downloadTool.run({ session, chooseFile: () => {} })),
    ).resolves.toBeUndefined();
  });
});
