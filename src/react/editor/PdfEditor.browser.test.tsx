import { act, createRef, type ReactNode, type RefObject, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createFakeProcessor } from "../../../test/fakes/fake-processor.js";
import { cleanUp, loadStyles, mount } from "../../../test/react.js";
import type { PdfEngine } from "../../core/ports/pdf-engine.js";
import { PdfEditor } from "./PdfEditor.js";
import type { PdfEditorChange, PdfEditorHandle, PdfEditorProps } from "./types.js";

afterEach(cleanUp);

const fakePdf = (pageCount: number) =>
  encodeFakePdf({
    pages: Array.from({ length: pageCount }, () => ({ width: 600, height: 800 })),
  });

const pdfFile = (pageCount: number, name = "report.pdf") =>
  new File([fakePdf(pageCount)], name, { type: "application/pdf" });

const notAPdf = () => new File(["just some text"], "notes.pdf", { type: "application/pdf" });

/** An engine whose opens wait until the test lets them through. */
function gatedEngine() {
  const engine = createFakeEngine();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gated: PdfEngine = {
    ...engine,
    open: async (source, options) => {
      await gate;
      return engine.open(source, options);
    },
  };
  return { engine: gated, release };
}

interface HostProps {
  readonly props: Partial<PdfEditorProps>;
  readonly handle: RefObject<PdfEditorHandle | null>;
  readonly changes: PdfEditorChange[];
  readonly control: { setFile: (file: PdfEditorProps["file"]) => void };
}

/** Renders the editor with fakes, and lets a test change its `file` prop. */
function Host({ props, handle, changes, control }: HostProps): ReactNode {
  const [file, setFile] = useState<PdfEditorProps["file"]>(props.file);
  control.setFile = setFile;
  return (
    <PdfEditor
      ref={handle}
      engine={createFakeEngine()}
      processor={createFakeProcessor()}
      onChange={(change) => changes.push(change)}
      {...props}
      {...(file !== undefined ? { file } : {})}
    />
  );
}

function setUp(props: Partial<PdfEditorProps> = {}, css?: string) {
  const changes: PdfEditorChange[] = [];
  const handle = createRef<PdfEditorHandle>();
  const control = { setFile: (_: PdfEditorProps["file"]) => {} };
  return {
    changes,
    handle,
    setFile: (file: PdfEditorProps["file"]) => act(async () => control.setFile(file)),
    mounted: mount(<Host props={props} handle={handle} changes={changes} control={control} />, css),
  };
}

/**
 * Waits until the editor reaches a status. Engines read files
 * asynchronously, and some browsers take several tasks to do it.
 */
const settle = async (container: HTMLElement, status: string) => {
  await vi.waitFor(() => expect(editor(container)?.dataset["hmStatus"]).toBe(status));
  await act(async () => {});
};

const editor = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[role="group"][aria-label="PDF editor"]');
const button = (container: HTMLElement) => container.querySelector("button");
const input = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
const announcer = (container: HTMLElement) =>
  container.querySelector(".hm-pdf-editor-announcer")?.textContent;

describe("PdfEditor", () => {
  it("starts with a labelled group, a button to choose a PDF and a privacy hint", async () => {
    const { mounted } = setUp();
    const container = await mounted;
    expect(editor(container)?.dataset["hmStatus"]).toBe("empty");
    const choose = button(container) as HTMLButtonElement;
    expect(choose.textContent).toBe("Choose a PDF");
    const hint = document.getElementById(choose.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toMatch(/stays on this device and is never uploaded/);
    // The file input is only the picker behind the button.
    expect(input(container).tabIndex).toBe(-1);
    expect(input(container).accept).toBe("application/pdf,.pdf");
    // The empty toolbar slot takes no room.
    const slot = container.querySelector(".hm-pdf-editor-toolbar") as HTMLElement;
    expect(getComputedStyle(slot).display).toBe("none");
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("opens a chosen file, announces it and moves focus to the document", async () => {
    const { mounted, changes } = setUp();
    const container = await mounted;
    (button(container) as HTMLButtonElement).focus();
    await userEvent.upload(input(container), pdfFile(3));
    await settle(container, "ready");

    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(changes).toEqual([{ reason: "open", pageCount: 3 }]);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(container.querySelectorAll(".hm-pdf-page")).toHaveLength(3);
    expect(announcer(container)).toBe("Opened a PDF with 3 pages.");
    expect(document.activeElement).toBe(container.querySelector(".hm-pdf-viewer"));
    expect(input(container)?.value ?? "").toBe("");
  });

  it("shows a loading state while the file opens", async () => {
    const { engine, release } = gatedEngine();
    const { mounted } = setUp({ engine });
    const container = await mounted;
    await userEvent.upload(input(container), pdfFile(1));
    await settle(container, "opening");

    expect(editor(container)?.dataset["hmStatus"]).toBe("opening");
    expect(editor(container)?.getAttribute("aria-busy")).toBe("true");
    const status = container.querySelector(".hm-pdf-editor-loading");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.textContent).toBe("Opening the PDF…");

    release();
    await settle(container, "ready");
    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
  });

  it("explains a failed open by its code, and lets the user try another file", async () => {
    const { mounted, changes } = setUp();
    const container = await mounted;
    (button(container) as HTMLButtonElement).focus();
    await userEvent.upload(input(container), notAPdf());
    await settle(container, "error");

    expect(editor(container)?.dataset["hmStatus"]).toBe("error");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "This file isn't a PDF, or it's too damaged to open.",
    );
    const retry = button(container) as HTMLButtonElement;
    expect(retry.textContent).toBe("Choose another PDF");
    expect(document.activeElement).toBe(retry);
    expect(changes).toEqual([]);

    await userEvent.upload(input(container), pdfFile(2));
    await settle(container, "ready");
    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps the open document when a replacement fails, and says why", async () => {
    const { mounted, handle } = setUp();
    const container = await mounted;
    await act(() => handle.current?.open(fakePdf(2)));
    await act(() => handle.current?.open(notAPdf()).catch(() => {}));

    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(container.querySelectorAll(".hm-pdf-page")).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/isn't a PDF/);
  });

  it("opens a file dropped on the start area", async () => {
    const { mounted, changes } = setUp();
    const container = await mounted;
    const zone = container.querySelector(".hm-pdf-editor-start") as HTMLElement;
    const data = new DataTransfer();
    data.items.add(pdfFile(2));

    await act(async () => {
      zone.dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    });
    expect(zone.hasAttribute("data-hm-dragging")).toBe(true);
    await act(async () => {
      zone.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    });
    await settle(container, "ready");
    expect(changes).toEqual([{ reason: "open", pageCount: 2 }]);
  });

  it("opens the host's file, a new one when it changes, and closes on null", async () => {
    const { mounted, changes, setFile } = setUp({ file: fakePdf(1) });
    const container = await mounted;
    await settle(container, "ready");
    expect(changes).toEqual([{ reason: "open", pageCount: 1 }]);

    await setFile(pdfFile(4));
    await vi.waitFor(() => expect(container.querySelectorAll(".hm-pdf-page")).toHaveLength(4));
    await settle(container, "ready");

    await setFile(null);
    await settle(container, "empty");
    expect(changes.map((change) => change.reason)).toEqual(["open", "open", "close"]);
    expect(editor(container)?.dataset["hmStatus"]).toBe("empty");
    expect(announcer(container)).toBe("The PDF was closed.");
  });

  it("gives the host a handle to edit, undo, redo and export", async () => {
    const { mounted, changes, handle } = setUp();
    await mounted;
    const editorHandle = handle.current as PdfEditorHandle;
    await act(() => editorHandle.open(fakePdf(2)));
    const [first] = editorHandle.session.getSnapshot().plan.pages;

    await act(async () =>
      editorHandle.session.execute({
        type: "pdf.rotatePages",
        pages: [first?.key ?? ""],
        angle: 90,
      }),
    );
    await act(async () => editorHandle.undo());
    await act(async () => editorHandle.redo());
    expect(changes.map((change) => change.reason)).toEqual(["open", "edit", "edit", "edit"]);

    const bytes = await editorHandle.export();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    await act(() => editorHandle.close());
    expect(changes.at(-1)).toEqual({ reason: "close", pageCount: 0 });
  });

  it("puts the thumbnails beside the document on wider screens", async () => {
    // The sidebar's width comes from ui's tokens, which hosts load with ui.
    const { mounted, handle } = setUp(
      {},
      "--hm-target-size: 44px; width: 800px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
    );
    const container = await mounted;
    await act(() => handle.current?.open(fakePdf(2)));
    const sidebar = container.querySelector(".hm-pdf-editor-sidebar") as HTMLElement;
    const viewer = container.querySelector(".hm-pdf-viewer") as HTMLElement;
    expect(sidebar.getBoundingClientRect().width).toBeCloseTo(176, 0);
    expect(viewer.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      sidebar.getBoundingClientRect().right,
    );
    // The editor keeps the height it's given; its parts scroll within it.
    expect(editor(container)?.getBoundingClientRect().height).toBeCloseTo(600, 0);
  });

  describe("without ui's tokens", () => {
    // Hosts that don't load @hussmartinez/ui's stylesheet lose the looks,
    // never the layout. These tests load only the SDK's styles.
    const unset = () =>
      expect(getComputedStyle(document.documentElement).getPropertyValue("--hm-target-size")).toBe(
        "",
      );

    it("keeps the thumbnails beside the document, and sizes the pages to the viewer", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      unset();
      await act(() => handle.current?.open(fakePdf(2)));
      const sidebar = (
        container.querySelector(".hm-pdf-editor-sidebar") as HTMLElement
      ).getBoundingClientRect();
      const viewer = container.querySelector(".hm-pdf-viewer") as HTMLElement;
      const area = viewer.getBoundingClientRect();
      expect(sidebar.width).toBeCloseTo(160, 0);
      expect(sidebar.height).toBeCloseTo(600, 0);
      expect(area.left).toBeGreaterThanOrEqual(sidebar.right);
      expect(area.width).toBeCloseTo(640, 0);
      expect(area.height).toBeCloseTo(600, 0);
      await vi.waitFor(() => {
        const page = (
          container.querySelector(".hm-pdf-page") as HTMLElement
        ).getBoundingClientRect();
        expect(page.width).toBeGreaterThan(area.width / 2);
        expect(page.width).toBeLessThanOrEqual(viewer.clientWidth);
      });
    });

    it("gives the document the width on narrow screens", async () => {
      const { mounted, handle } = setUp(
        {},
        "width: 360px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
      );
      const container = await mounted;
      unset();
      await act(() => handle.current?.open(fakePdf(2)));
      const sidebar = container.querySelector(".hm-pdf-editor-sidebar") as HTMLElement;
      expect(getComputedStyle(sidebar).display).toBe("none");
      const viewer = container.querySelector(".hm-pdf-viewer") as HTMLElement;
      expect(viewer.getBoundingClientRect().width).toBeCloseTo(360, 0);
    });
  });

  it("renders on a server and hydrates without warnings (ADR 0007)", async () => {
    await loadStyles();
    const tree = <PdfEditor engine={createFakeEngine()} processor={createFakeProcessor()} />;
    const html = renderToString(tree);
    expect(html).toContain("Choose a PDF");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root?.unmount());
    container.remove();
  });
});
