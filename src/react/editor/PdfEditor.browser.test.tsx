import { act, createRef, type ReactNode, type RefObject, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createFakeProcessor } from "../../../test/fakes/fake-processor.js";
import { cleanUp, loadStyles, mount, type StyleOptions } from "../../../test/react.js";
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

function setUp(props: Partial<PdfEditorProps> = {}, css?: string, styles: StyleOptions = {}) {
  const changes: PdfEditorChange[] = [];
  const handle = createRef<PdfEditorHandle>();
  const control = { setFile: (_: PdfEditorProps["file"]) => {} };
  return {
    changes,
    handle,
    setFile: (file: PdfEditorProps["file"]) => act(async () => control.setFile(file)),
    mounted: mount(
      <Host props={props} handle={handle} changes={changes} control={control} />,
      css,
      styles,
    ),
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
const button = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(".hm-pdf-editor-start button");
const input = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
/** Waits for a number of animation frames, and for React to apply what they changed. */
const frames = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
};

/**
 * What ui's polite live region says after an announcement. ui clears the
 * region, then sets the text in an animation frame, so screen readers notice
 * a repeat. Frames run in the order they're asked for, so two more frames
 * guarantee it has run, however slowly a busy browser schedules them.
 */
const announced = async (container: HTMLElement, text: string) => {
  await frames(2);
  expect(container.querySelector('.hm-announcer [aria-live="polite"]')?.textContent).toBe(text);
};

/** A host's icon, for the icons prop. */
function Star() {
  return <svg data-testid="star" />;
}

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
    // The toolbar is there from the start; only opening is possible yet.
    expect(container.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "PDF tools",
    );
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
    await announced(container, "Opened a PDF with 3 pages.");
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
    expect(container.querySelector('.hm-pdf-editor-alert[role="alert"]')?.textContent).toBe(
      "This file isn't a PDF, or it's too damaged to open.",
    );
    const retry = button(container) as HTMLButtonElement;
    expect(retry.textContent).toBe("Choose another PDF");
    expect(document.activeElement).toBe(retry);
    expect(changes).toEqual([]);

    await userEvent.upload(input(container), pdfFile(2));
    await settle(container, "ready");
    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(container.querySelector(".hm-pdf-editor-alert")).toBeNull();
  });

  it("keeps the open document when a replacement fails, and says why", async () => {
    const { mounted, handle } = setUp();
    const container = await mounted;
    await act(() => handle.current?.open(fakePdf(2)));
    await act(() => handle.current?.open(notAPdf()).catch(() => {}));

    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(container.querySelectorAll(".hm-pdf-page")).toHaveLength(2);
    expect(container.querySelector('.hm-pdf-editor-alert[role="alert"]')?.textContent).toMatch(
      /isn't a PDF/,
    );
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
    await announced(container, "The PDF was closed.");
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
    const { mounted, handle } = setUp();
    const container = await mounted;
    await act(() => handle.current?.open(fakePdf(2)));
    const sidebar = container.querySelector(".hm-pdf-editor-sidebar") as HTMLElement;
    const viewer = container.querySelector(".hm-pdf-viewer") as HTMLElement;
    // Five control heights wide, from ui's tokens: a toolbar button is one.
    const control = container.querySelector('[role="toolbar"] button') as HTMLElement;
    expect(sidebar.getBoundingClientRect().width).toBeCloseTo(
      control.getBoundingClientRect().height * 5,
      0,
    );
    expect(viewer.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      sidebar.getBoundingClientRect().right,
    );
    // The editor keeps the height it's given; its parts scroll within it.
    expect(editor(container)?.getBoundingClientRect().height).toBeCloseTo(600, 0);
  });

  describe("without ui's tokens", () => {
    // ui's stylesheet is required (sdk-core ADR 0036), but if a host leaves it
    // out the editor still keeps its layout. These tests load only the SDK's
    // styles.
    const unset = () =>
      expect(getComputedStyle(document.documentElement).getPropertyValue("--hm-target-size")).toBe(
        "",
      );

    it("keeps the thumbnails beside the document, and sizes the pages to the viewer", async () => {
      const { mounted, handle } = setUp({}, undefined, { ui: false });
      const container = await mounted;
      unset();
      await act(() => handle.current?.open(fakePdf(2)));
      const sidebar = (
        container.querySelector(".hm-pdf-editor-sidebar") as HTMLElement
      ).getBoundingClientRect();
      const viewer = container.querySelector(".hm-pdf-viewer") as HTMLElement;
      const area = viewer.getBoundingClientRect();
      const body = (
        container.querySelector(".hm-pdf-editor-body") as HTMLElement
      ).getBoundingClientRect();
      expect(editor(container)?.getBoundingClientRect().height).toBeCloseTo(600, 0);
      expect(sidebar.width).toBeCloseTo(160, 0);
      expect(sidebar.height).toBeCloseTo(body.height, 0);
      expect(area.left).toBeGreaterThanOrEqual(sidebar.right);
      expect(area.width).toBeCloseTo(640, 0);
      expect(area.height).toBeCloseTo(body.height, 0);
      await vi.waitFor(() => {
        const page = (
          container.querySelector(".hm-pdf-page") as HTMLElement
        ).getBoundingClientRect();
        expect(page.width).toBeGreaterThan(area.width / 2);
        // clientWidth rounds to whole pixels.
        expect(page.width).toBeLessThanOrEqual(viewer.clientWidth + 1);
      });
    });

    it("gives the document the width on narrow screens", async () => {
      const { mounted, handle } = setUp(
        {},
        "width: 360px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
        { ui: false },
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

  describe("the toolbar", () => {
    const toolbar = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('[role="toolbar"]') as HTMLElement;
    const tool = (container: HTMLElement, id: string) =>
      container.querySelector<HTMLButtonElement>(`[data-hm-tool="${id}"]`) as HTMLButtonElement;
    const rotations = (handle: { current: PdfEditorHandle | null }) =>
      handle.current?.session.getSnapshot().plan.pages.map((page) => page.rotation);

    it("is a labelled toolbar of labelled groups, with only what can run enabled", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      const groups = [...toolbar(container).querySelectorAll('[role="group"]')];
      expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
        "File",
        "History",
        "Pages",
      ]);
      const buttons = [...toolbar(container).querySelectorAll("button")];
      expect(
        buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent),
      ).toEqual(["Open a PDF", "Undo", "Redo", "Rotate left", "Rotate right"]);
      expect(buttons.map((button) => button.disabled)).toEqual([false, true, true, true, true]);
      expect(tool(container, "pdf.undo").getAttribute("aria-keyshortcuts")).toBe("Control+Z");
      expect(tool(container, "pdf.rotate-right").getAttribute("aria-keyshortcuts")).toBe("]");

      await act(() => handle.current?.open(fakePdf(2)));
      expect(tool(container, "pdf.rotate-left").disabled).toBe(false);
      expect(tool(container, "pdf.undo").disabled).toBe(true);
    });

    it("rotates the current page, then undoes and redoes, announcing each", async () => {
      const { mounted, handle, changes } = setUp();
      const container = await mounted;
      await act(() => handle.current?.open(fakePdf(2)));

      await userEvent.click(tool(container, "pdf.rotate-right"));
      expect(rotations(handle)).toEqual([90, 0]);
      expect(changes.at(-1)).toEqual({ reason: "edit", pageCount: 2 });
      await announced(container, "Rotated 1 page.");

      await userEvent.click(tool(container, "pdf.undo"));
      expect(rotations(handle)).toEqual([0, 0]);
      await announced(container, "Undone.");

      await userEvent.click(tool(container, "pdf.redo"));
      expect(rotations(handle)).toEqual([90, 0]);
      await announced(container, "Redone.");
    });

    it("rotates every selected page", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      await act(() => handle.current?.open(fakePdf(3)));
      await act(async () => handle.current?.session.select(["p1", "p3"]));
      await userEvent.click(tool(container, "pdf.rotate-left"));
      expect(rotations(handle)).toEqual([270, 0, 270]);
      await announced(container, "Rotated 2 pages.");
    });

    it("takes its shortcuts while focus is in the editor, and only then", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      const outside = document.createElement("button");
      document.body.append(outside);
      try {
        await act(() => handle.current?.open(fakePdf(2)));
        (container.querySelector(".hm-pdf-viewer") as HTMLElement).focus();
        await userEvent.keyboard("]");
        expect(rotations(handle)).toEqual([90, 0]);
        await userEvent.keyboard("{Control>}z{/Control}");
        expect(rotations(handle)).toEqual([0, 0]);
        // "[[" types "[": a single one starts a key descriptor.
        await userEvent.keyboard("[[");
        expect(rotations(handle)).toEqual([270, 0]);

        outside.focus();
        await userEvent.keyboard("]");
        expect(rotations(handle)).toEqual([270, 0]);
      } finally {
        outside.remove();
      }
    });

    it("opens a PDF from the open tool", async () => {
      const { mounted, changes } = setUp();
      const container = await mounted;
      const picker = container.querySelector<HTMLInputElement>(
        ':scope > .hm-pdf-editor > input[type="file"]',
      ) as HTMLInputElement;
      const clicked = vi.fn();
      picker.addEventListener("click", (event) => {
        // The test chooses the file itself, so no system picker opens.
        event.preventDefault();
        clicked();
      });
      await userEvent.click(tool(container, "pdf.open"));
      expect(clicked).toHaveBeenCalledOnce();
      await userEvent.upload(picker, pdfFile(2));
      await settle(container, "ready");
      expect(changes).toEqual([{ reason: "open", pageCount: 2 }]);
    });

    it("shows the chosen tools in the chosen groups, and hides with an empty toolbar", async () => {
      const chosen = setUp({ tools: ["pdf.undo", "pdf.redo"] });
      const container = await chosen.mounted;
      expect(
        [...toolbar(container).querySelectorAll("button")].map(
          (button) => button.dataset["hmTool"],
        ),
      ).toEqual(["pdf.undo", "pdf.redo"]);
      await cleanUp();

      const hidden = setUp({ toolbar: [] });
      const bare = await hidden.mounted;
      expect(bare.querySelector('[role="toolbar"]')).toBeNull();
      // The shortcuts stay.
      await act(() => hidden.handle.current?.open(fakePdf(1)));
      (bare.querySelector(".hm-pdf-viewer") as HTMLElement).focus();
      await userEvent.keyboard("]");
      expect(rotations(hidden.handle)).toEqual([90]);
    });

    it("throws for a tool it doesn't know", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(setUp({ tools: ["pdf.nothing"] }).mounted).rejects.toThrow(TypeError);
      } finally {
        errors.mockRestore();
      }
    });

    it("takes the host's icons over its own", async () => {
      const { mounted } = setUp({ icons: { undo: Star } });
      const container = await mounted;
      expect(tool(container, "pdf.undo").querySelector('[data-testid="star"]')).not.toBeNull();
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
