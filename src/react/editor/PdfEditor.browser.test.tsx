import { useUiMessages } from "@hussmartinez/ui/react";
import { act, createRef, type ReactNode, type RefObject, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { createFakeProcessor } from "../../../test/fakes/fake-processor.js";
import { jpxPdf } from "../../../test/fixtures/pdfs.js";
import { cleanUp, loadStyles, mount, type StyleOptions, waitFor } from "../../../test/react.js";
import { PdfError } from "../../core/errors/pdf-error.js";
import type { PdfEngine } from "../../core/ports/pdf-engine.js";
import type { PdfProcessor } from "../../core/ports/pdf-processor.js";
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
const settle = async (container: HTMLElement, status: string, timeout?: number) => {
  await waitFor(() => expect(editor(container)?.dataset["hmStatus"]).toBe(status), {
    ...(timeout === undefined ? {} : { timeout }),
  });
};

/**
 * How long the file's first open may take, in milliseconds. It's the slowest
 * open in the file, and on a loaded machine WebKit has run past the browser
 * tests' default of fifteen seconds there, so its test and its wait allow
 * thirty. Later opens stay within the defaults.
 */
const FIRST_OPEN = 30_000;

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

/** A host's icon that shows ui's text, as ui's components read it. */
function Labelled() {
  return <svg data-testid="labelled" aria-label={useUiMessages().t("spinner.label")} />;
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

  it("opens a chosen file, announces it and moves focus to the document", {
    timeout: FIRST_OPEN,
  }, async () => {
    const { mounted, changes } = setUp();
    const container = await mounted;
    (button(container) as HTMLButtonElement).focus();
    await act(() => userEvent.upload(input(container), pdfFile(3)));
    // The file's first open (FIRST_OPEN).
    await settle(container, "ready", FIRST_OPEN);

    expect(editor(container)?.dataset["hmStatus"]).toBe("ready");
    expect(changes).toEqual([{ reason: "open", pageCount: 3, fileName: "report.pdf" }]);
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
    await act(() => userEvent.upload(input(container), pdfFile(1)));
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
    await act(() => userEvent.upload(input(container), notAPdf()));
    await settle(container, "error");

    expect(editor(container)?.dataset["hmStatus"]).toBe("error");
    expect(container.querySelector('.hm-pdf-editor-alert[role="alert"]')?.textContent).toBe(
      "This file isn't a PDF, or it's too damaged to open.",
    );
    const retry = button(container) as HTMLButtonElement;
    expect(retry.textContent).toBe("Choose another PDF");
    expect(document.activeElement).toBe(retry);
    expect(changes).toEqual([]);

    await act(() => userEvent.upload(input(container), pdfFile(2)));
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
    expect(changes).toEqual([{ reason: "open", pageCount: 2, fileName: "report.pdf" }]);
  });

  it("opens the host's file, a new one when it changes, and closes on null", async () => {
    const { mounted, changes, setFile } = setUp({ file: fakePdf(1) });
    const container = await mounted;
    await settle(container, "ready");
    expect(changes).toEqual([{ reason: "open", pageCount: 1 }]);

    await setFile(pdfFile(4));
    await waitFor(() => expect(container.querySelectorAll(".hm-pdf-page")).toHaveLength(4));
    await settle(container, "ready");

    await setFile(null);
    await settle(container, "empty");
    expect(changes.map((change) => change.reason)).toEqual(["open", "open", "close"]);
    // Bytes have no name; a File has its own.
    expect(changes[0]).not.toHaveProperty("fileName");
    expect(changes[1]?.fileName).toBe("report.pdf");
    expect(editor(container)?.dataset["hmStatus"]).toBe("empty");
    await announced(container, "The PDF was closed.");
  });

  it("names the file the host opens through the handle, cleaned (docs/adr/0009)", async () => {
    const { mounted, changes, handle } = setUp();
    await mounted;
    await act(() => handle.current?.open(fakePdf(1), { name: "../../scans/in\u202Evoice.pdf" }));
    expect(changes).toEqual([{ reason: "open", pageCount: 1, fileName: "invoice.pdf" }]);
    expect(handle.current?.session.getSnapshot().sources[0]?.name).toBe("invoice.pdf");
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

    const bytes = await act(() => editorHandle.export());
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

  it("sets its own text in ui's type, whatever the host page sets around it", async () => {
    const { mounted } = setUp(
      {},
      "width: 800px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr); font: 30px/3 serif;",
    );
    const container = await mounted;
    // The tokens' computed values, read from an element that uses them.
    const probe = document.createElement("span");
    probe.style.cssText =
      "font-family: var(--hm-font-family); font-size: var(--hm-font-size-body); line-height: var(--hm-line-height-body);";
    document.body.append(probe);
    const expected = getComputedStyle(probe);
    // The start area's privacy hint: plain text of the editor's own.
    const choose = button(container) as HTMLButtonElement;
    const hint = getComputedStyle(
      document.getElementById(choose.getAttribute("aria-describedby") ?? "") as HTMLElement,
    );
    const root = getComputedStyle(editor(container) as HTMLElement);
    try {
      expect(expected.fontFamily).not.toMatch(/^serif$/);
      expect(root.fontFamily).toBe(expected.fontFamily);
      expect(root.fontSize).toBe(expected.fontSize);
      expect(root.lineHeight).toBe(expected.lineHeight);
      expect(hint.fontFamily).toBe(expected.fontFamily);
    } finally {
      probe.remove();
    }
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
      await waitFor(() => {
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
    /** ui's toolbar buttons stay focusable when disabled, with aria-disabled (docs/adr/0008). */
    const disabled = (button: HTMLButtonElement) =>
      button.disabled || button.getAttribute("aria-disabled") === "true";
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
        "Save",
      ]);
      const buttons = [...toolbar(container).querySelectorAll("button")];
      expect(
        buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent),
      ).toEqual([
        "Open a PDF",
        "Undo",
        "Redo",
        "Rotate left",
        "Rotate right",
        "Delete pages",
        "Download",
      ]);
      expect(buttons.map(disabled)).toEqual([false, true, true, true, true, true, true]);
      // Disabled buttons keep focus, rather than the disabled attribute.
      expect(buttons.some((button) => button.disabled)).toBe(false);
      expect(tool(container, "pdf.undo").getAttribute("aria-keyshortcuts")).toBe("Control+Z");
      expect(tool(container, "pdf.rotate-right").getAttribute("aria-keyshortcuts")).toBe("]");
      // The delete keys work in the thumbnails, and the button says so.
      expect(tool(container, "pdf.delete-pages").getAttribute("aria-keyshortcuts")).toBe(
        "Delete Backspace",
      );

      await act(() => handle.current?.open(fakePdf(2)));
      expect(disabled(tool(container, "pdf.rotate-left"))).toBe(false);
      expect(disabled(tool(container, "pdf.delete-pages"))).toBe(false);
      expect(disabled(tool(container, "pdf.undo"))).toBe(true);
    });

    it("rotates the current page, then undoes and redoes, announcing each", async () => {
      const { mounted, handle, changes } = setUp();
      const container = await mounted;
      await act(() => handle.current?.open(fakePdf(2)));

      await act(() => userEvent.click(tool(container, "pdf.rotate-right")));
      expect(rotations(handle)).toEqual([90, 0]);
      expect(changes.at(-1)).toEqual({ reason: "edit", pageCount: 2 });
      await announced(container, "Rotated 1 page.");

      await act(() => userEvent.click(tool(container, "pdf.undo")));
      expect(rotations(handle)).toEqual([0, 0]);
      await announced(container, "Undone.");

      await act(() => userEvent.click(tool(container, "pdf.redo")));
      expect(rotations(handle)).toEqual([90, 0]);
      await announced(container, "Redone.");
    });

    it("rotates every selected page", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      await act(() => handle.current?.open(fakePdf(3)));
      await act(async () => handle.current?.session.select(["p1", "p3"]));
      await act(() => userEvent.click(tool(container, "pdf.rotate-left")));
      expect(rotations(handle)).toEqual([270, 0, 270]);
      await announced(container, "Rotated 2 pages.");
    });

    describe("downloading (docs/adr/0009)", () => {
      /** Records browser downloads instead of making them. */
      function catchDownloads() {
        const downloads: { name: string; type: string; size: number }[] = [];
        const blobs = new Map<string, Blob>();
        const create = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
          const url = `blob:test/${blobs.size}`;
          blobs.set(url, blob as Blob);
          return url;
        });
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
          this: HTMLAnchorElement,
        ) {
          const blob = blobs.get(this.href) as Blob;
          downloads.push({ name: this.download, type: blob.type, size: blob.size });
        });
        return {
          downloads,
          restore: () => {
            create.mockRestore();
            revoke.mockRestore();
            click.mockRestore();
          },
        };
      }

      /** A processor whose builds wait until released, and stop when aborted. */
      function heldProcessor(fail?: PdfError) {
        const inner = createFakeProcessor();
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const builds = { started: 0 };
        const processor: PdfProcessor = {
          async build(job, options = {}) {
            builds.started += 1;
            await new Promise<void>((resolve, reject) => {
              void gate.then(resolve);
              options.signal?.addEventListener("abort", () => reject(options.signal?.reason));
            });
            if (fail) throw fail;
            return inner.build(job, options);
          },
          destroy: () => inner.destroy(),
        };
        return { processor, release, builds };
      }

      const statusText = (container: HTMLElement) =>
        container.querySelector(".hm-pdf-editor-saving [role='status']")?.textContent ?? null;
      const alertText = (container: HTMLElement) =>
        container.querySelector(".hm-pdf-editor-header > [role='alert']")?.textContent ?? null;

      it("downloads the document under the opened file's name, and says so", async () => {
        const caught = catchDownloads();
        try {
          const { mounted, handle } = setUp();
          const container = await mounted;
          await act(() => handle.current?.open(pdfFile(2, "C:\\scans\\report.pdf")));
          const button = tool(container, "pdf.download");
          expect(button.getAttribute("aria-label")).toBe("Download");
          expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
          await act(() => userEvent.click(button));
          await waitFor(() => expect(caught.downloads).toHaveLength(1));
          expect(caught.downloads[0]).toMatchObject({
            name: "report.pdf",
            type: "application/pdf",
          });
          expect(caught.downloads[0]?.size).toBeGreaterThan(0);
          await announced(container, "Saved report.pdf.");
          expect(document.activeElement).toBe(button);
          expect(statusText(container)).toBeNull();
        } finally {
          caught.restore();
        }
      });

      it("names bytes document.pdf, and follows the host's downloadName", async () => {
        const caught = catchDownloads();
        try {
          const first = setUp();
          const container = await first.mounted;
          await act(() => first.handle.current?.open(fakePdf(1)));
          await act(() => userEvent.click(tool(container, "pdf.download")));
          await waitFor(() =>
            expect(caught.downloads.map((d) => d.name)).toEqual(["document.pdf"]),
          );
          await cleanUp();

          const downloadName = vi.fn(() => "../Q3 summary");
          const second = setUp({ downloadName });
          const other = await second.mounted;
          await act(() => second.handle.current?.open(pdfFile(3, "report.pdf")));
          await act(() => userEvent.click(tool(other, "pdf.download")));
          await waitFor(() => expect(caught.downloads).toHaveLength(2));
          expect(caught.downloads[1]?.name).toBe("Q3 summary.pdf");
          expect(downloadName).toHaveBeenCalledWith({ sourceName: "report.pdf", pageCount: 3 });
        } finally {
          caught.restore();
        }
      });

      it("hands the bytes to onExport instead of downloading", async () => {
        const caught = catchDownloads();
        try {
          const onExport = vi.fn();
          const { mounted, handle } = setUp({ onExport });
          const container = await mounted;
          await act(() => handle.current?.open(pdfFile(2, "report.pdf")));
          await act(() => userEvent.click(tool(container, "pdf.download")));
          await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
          const [bytes, info] = onExport.mock.calls[0] as [Uint8Array, unknown];
          expect(bytes).toBeInstanceOf(Uint8Array);
          expect(bytes.byteLength).toBeGreaterThan(0);
          expect(info).toEqual({ fileName: "report.pdf", pageCount: 2 });
          expect(caught.downloads).toEqual([]);
          await announced(container, "The PDF is ready.");
        } finally {
          caught.restore();
        }
      });

      it("is busy while it builds: it can't run twice, and offers Cancel after a second", async () => {
        const caught = catchDownloads();
        const held = heldProcessor();
        try {
          const { mounted, handle } = setUp({ processor: held.processor });
          const container = await mounted;
          await act(() => handle.current?.open(fakePdf(2)));
          // An edit, so the processor builds the document.
          await act(async () =>
            handle.current?.session.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 }),
          );
          const button = tool(container, "pdf.download");
          await act(() => userEvent.click(button));
          expect(statusText(container)).toBe("Preparing the PDF…");
          expect(editor(container)?.getAttribute("aria-busy")).toBe("true");
          expect(disabled(button)).toBe(true);
          expect(document.activeElement).toBe(button);
          // Playwright won't click an aria-disabled button, so the click is
          // dispatched directly: ui's button must ignore it.
          await act(async () => button.click());
          await act(() => userEvent.keyboard("{Enter}"));
          expect(held.builds.started).toBe(1);
          expect(container.querySelector(".hm-pdf-editor-saving button")).toBeNull();

          // It appears once the save has taken a second.
          await waitFor(
            () => expect(container.querySelector(".hm-pdf-editor-saving button")).not.toBeNull(),
            { timeout: 3_000 },
          );
          const cancel = container.querySelector(
            ".hm-pdf-editor-saving button",
          ) as HTMLButtonElement;
          expect(cancel.textContent).toBe("Cancel");
          await act(() => userEvent.click(cancel));
          await waitFor(() => expect(statusText(container)).toBeNull());
          // Cancelling ends quietly: no alert, nothing saved.
          expect(alertText(container)).toBeNull();
          expect(caught.downloads).toEqual([]);
          expect(disabled(button)).toBe(false);
          expect(editor(container)?.getAttribute("aria-busy")).toBe("false");
        } finally {
          held.release();
          caught.restore();
        }
      });

      it("says why when the build fails, and saves nothing", async () => {
        const caught = catchDownloads();
        const held = heldProcessor(new PdfError("PROCESSING_FAILED", "<b>from the worker</b>"));
        try {
          const { mounted, handle } = setUp({ processor: held.processor });
          const container = await mounted;
          await act(() => handle.current?.open(fakePdf(2)));
          await act(async () =>
            handle.current?.session.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 }),
          );
          const button = tool(container, "pdf.download");
          await act(() => userEvent.click(button));
          held.release();
          await waitFor(() =>
            expect(alertText(container)).toBe(
              "Something went wrong while processing this PDF. Please try again.",
            ),
          );
          expect(caught.downloads).toEqual([]);
          expect(document.activeElement).toBe(button);
        } finally {
          caught.restore();
        }
      });

      it("says the PDF couldn't be saved when onExport fails, until the next document opens", async () => {
        const onExport = vi.fn(async () => {
          throw new Error("The host's storage is full.");
        });
        const { mounted, handle } = setUp({ onExport });
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(2)));
        await act(() => userEvent.click(tool(container, "pdf.download")));
        await waitFor(() =>
          expect(alertText(container)).toBe("The PDF couldn't be saved. Please try again."),
        );
        await act(() => handle.current?.open(fakePdf(1)));
        expect(alertText(container)).toBeNull();
      });

      it("cancels a running save when another document opens", async () => {
        const caught = catchDownloads();
        const held = heldProcessor();
        try {
          const { mounted, handle } = setUp({ processor: held.processor });
          const container = await mounted;
          await act(() => handle.current?.open(fakePdf(2)));
          await act(async () =>
            handle.current?.session.execute({ type: "pdf.rotatePages", pages: ["p1"], angle: 90 }),
          );
          await act(() => userEvent.click(tool(container, "pdf.download")));
          expect(statusText(container)).toBe("Preparing the PDF…");
          await act(() => handle.current?.open(fakePdf(1)));
          await waitFor(() => expect(statusText(container)).toBeNull());
          held.release();
          expect(alertText(container)).toBeNull();
          expect(caught.downloads).toEqual([]);
        } finally {
          caught.restore();
        }
      });

      it("leaves Ctrl+S and \u2318S to the browser", async () => {
        const caught = catchDownloads();
        const seen: boolean[] = [];
        const record = (event: KeyboardEvent) => {
          if (event.key.toLowerCase() === "s") seen.push(event.defaultPrevented);
        };
        window.addEventListener("keydown", record);
        try {
          const { mounted, handle } = setUp();
          const container = await mounted;
          await act(() => handle.current?.open(fakePdf(2)));
          (container.querySelector(".hm-pdf-viewer") as HTMLElement).focus();
          await act(() => userEvent.keyboard("{Control>}s{/Control}{Meta>}s{/Meta}"));
          expect(seen).toEqual([false, false]);
          expect(statusText(container)).toBeNull();
          expect(caught.downloads).toEqual([]);
        } finally {
          window.removeEventListener("keydown", record);
          caught.restore();
        }
      });
    });

    describe("deleting pages (docs/adr/0008)", () => {
      const option = (container: HTMLElement, key: string) =>
        container.querySelector<HTMLElement>(
          `[role="option"][data-hm-page-key="${key}"]`,
        ) as HTMLElement;
      const pageKeys = (handle: { current: PdfEditorHandle | null }) =>
        handle.current?.session.getSnapshot().plan.pages.map((page) => page.key);

      it("deletes the selection with Delete in the thumbnails, says so, and keeps focus in the list", async () => {
        const { mounted, handle, changes } = setUp();
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(4)));
        await act(() => userEvent.click(option(container, "p2")));
        await act(() => userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}"));
        expect(handle.current?.session.getSnapshot().selection).toEqual(["p2", "p3"]);

        await act(() => userEvent.keyboard("{Delete}"));
        expect(pageKeys(handle)).toEqual(["p1", "p4"]);
        expect(changes.at(-1)).toEqual({ reason: "edit", pageCount: 2 });
        await announced(container, "Deleted 2 pages.");
        // The page that took the first deleted page's place is chosen, and
        // focus moved to it, rather than falling to the page's body.
        expect(handle.current?.session.getSnapshot()).toMatchObject({
          selection: ["p4"],
          currentPage: "p4",
        });
        expect(document.activeElement).toBe(option(container, "p4"));
      });

      it("deletes with Backspace too, and undo brings back the pages and the selection", async () => {
        const { mounted, handle } = setUp();
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(3)));
        await act(() => userEvent.click(option(container, "p3")));
        await act(() => userEvent.keyboard("{Backspace}"));
        expect(pageKeys(handle)).toEqual(["p1", "p2"]);
        expect(document.activeElement).toBe(option(container, "p2"));

        await act(() => userEvent.keyboard("{Control>}z{/Control}"));
        expect(pageKeys(handle)).toEqual(["p1", "p2", "p3"]);
        expect(handle.current?.session.getSnapshot()).toMatchObject({
          selection: ["p3"],
          currentPage: "p3",
        });
        await announced(container, "Undone.");
      });

      it("ignores the delete keys outside the thumbnails, and with modifiers", async () => {
        const { mounted, handle } = setUp();
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(3)));
        (container.querySelector(".hm-pdf-viewer") as HTMLElement).focus();
        await act(() => userEvent.keyboard("{Delete}{Backspace}"));
        await act(() => userEvent.click(option(container, "p2")));
        await act(() => userEvent.keyboard("{Alt>}{Delete}{/Alt}{Shift>}{Backspace}{/Shift}"));
        expect(pageKeys(handle)).toEqual(["p1", "p2", "p3"]);
      });

      it("never deletes the last page, and its button keeps focus once disabled", async () => {
        const { mounted, handle } = setUp();
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(2)));
        const button = tool(container, "pdf.delete-pages");
        await act(() => userEvent.click(button));
        expect(pageKeys(handle)).toEqual(["p2"]);
        await announced(container, "Deleted 1 page.");
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(document.activeElement).toBe(button);

        await act(() => userEvent.keyboard("{Enter}"));
        await act(() => userEvent.click(option(container, "p2")));
        await act(() => userEvent.keyboard("{Delete}"));
        expect(pageKeys(handle)).toEqual(["p2"]);
      });

      it("prevents the keys' defaults in the thumbnails, so the page neither scrolls nor navigates, and leaves a host's field alone", async () => {
        // A host page that can scroll, with a history entry to go back to,
        // so a Backspace that went back or scrolled would show (docs/adr/0008).
        const spacer = document.createElement("div");
        spacer.style.height = "4000px";
        const field = document.createElement("input");
        field.type = "text";
        field.setAttribute("aria-label", "Host's own field");
        document.body.prepend(field);
        const seen: { key: string; prevented: boolean; inField: boolean }[] = [];
        const record = (event: KeyboardEvent) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            seen.push({
              key: event.key,
              prevented: event.defaultPrevented,
              inField: event.target === field,
            });
          }
        };
        // Bubbling to the window, so it runs after the editor's handlers.
        window.addEventListener("keydown", record);
        const url = location.href;
        history.pushState({ test: "delete keys" }, "", "#delete-keys");
        try {
          const { mounted, handle } = setUp();
          const container = await mounted;
          await act(() => handle.current?.open(fakePdf(4)));
          // Below the editor, so the page scrolls; the editor stays in view.
          document.body.append(spacer);
          // Chosen with the pointer, so p2 is selected and focused; the page
          // is scrolled afterwards, so only the keys could move it.
          await act(() => userEvent.click(option(container, "p2")));
          window.scrollTo(0, 40);
          const scrolled = window.scrollY;
          expect(scrolled).toBeGreaterThan(0);
          await act(() => userEvent.keyboard("{Delete}"));
          await act(() => userEvent.keyboard("{Backspace}"));
          expect(pageKeys(handle)).toEqual(["p1", "p4"]);
          expect(seen).toEqual([
            { key: "Delete", prevented: true, inField: false },
            { key: "Backspace", prevented: true, inField: false },
          ]);
          expect(location.hash).toBe("#delete-keys");
          expect(window.scrollY).toBe(scrolled);

          // In the host's field, the keys edit the text and nothing else.
          seen.length = 0;
          await act(() => userEvent.click(field));
          await act(() => userEvent.keyboard("abc{ArrowLeft}{Backspace}{Delete}"));
          expect(field.value).toBe("a");
          expect(seen).toEqual([
            { key: "Backspace", prevented: false, inField: true },
            { key: "Delete", prevented: false, inField: true },
          ]);
          expect(pageKeys(handle)).toEqual(["p1", "p4"]);
          expect(location.hash).toBe("#delete-keys");
        } finally {
          window.removeEventListener("keydown", record);
          history.replaceState(null, "", url);
          window.scrollTo(0, 0);
          spacer.remove();
          field.remove();
        }
      });

      it("leaves the keys alone when the host leaves the tool out", async () => {
        const { mounted, handle } = setUp({ tools: ["pdf.open", "pdf.undo", "pdf.redo"] });
        const container = await mounted;
        await act(() => handle.current?.open(fakePdf(3)));
        expect(tool(container, "pdf.delete-pages")).toBeNull();
        await act(() => userEvent.click(option(container, "p2")));
        await act(() => userEvent.keyboard("{Delete}"));
        expect(pageKeys(handle)).toEqual(["p1", "p2", "p3"]);
      });
    });

    it("takes its shortcuts while focus is in the editor, and only then", async () => {
      const { mounted, handle } = setUp();
      const container = await mounted;
      const outside = document.createElement("button");
      document.body.append(outside);
      try {
        await act(() => handle.current?.open(fakePdf(2)));
        (container.querySelector(".hm-pdf-viewer") as HTMLElement).focus();
        await act(() => userEvent.keyboard("]"));
        expect(rotations(handle)).toEqual([90, 0]);
        await act(() => userEvent.keyboard("{Control>}z{/Control}"));
        expect(rotations(handle)).toEqual([0, 0]);
        // "[[" types "[": a single one starts a key descriptor.
        await act(() => userEvent.keyboard("[["));
        expect(rotations(handle)).toEqual([270, 0]);

        outside.focus();
        await act(() => userEvent.keyboard("]"));
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
      await act(() => userEvent.click(tool(container, "pdf.open")));
      expect(clicked).toHaveBeenCalledOnce();
      await act(() => userEvent.upload(picker, pdfFile(2)));
      await settle(container, "ready");
      expect(changes).toEqual([{ reason: "open", pageCount: 2, fileName: "report.pdf" }]);
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
      await act(() => userEvent.keyboard("]"));
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

  it("gives its own components and ui's one set of text, with the host's overrides (sdk-core ADR 0046)", async () => {
    const { mounted } = setUp({
      icons: { undo: Labelled },
      locale: "de",
      messages: { "editor.start.choose": "PDF auswählen", "spinner.label": "Wird geladen" },
    });
    const container = await mounted;
    expect(button(container)?.textContent).toBe("PDF auswählen");
    expect(container.querySelector('[data-testid="labelled"]')?.getAttribute("aria-label")).toBe(
      "Wird geladen",
    );
  });

  it("opens and exports with a relative assetsUrl, served by this origin", async () => {
    const handle = createRef<PdfEditorHandle>();
    const container = await mount(<PdfEditor ref={handle} assetsUrl="/hm-test-assets/" />);
    await act(() => handle.current?.open(fakePdf(1)).catch(() => {}));
    // A fake PDF isn't a real one: pdf.js, loaded from /hm-test-assets/,
    // says so, which proves the relative URL resolved in the browser.
    expect(editor(container)?.dataset["hmStatus"]).toBe("error");
    await act(() => handle.current?.open(jpxPdf()));
    await settle(container, "ready");
    const [first] = handle.current?.session.getSnapshot().plan.pages ?? [];
    await act(async () =>
      handle.current?.session.execute({
        type: "pdf.rotatePages",
        pages: [first?.key ?? ""],
        angle: 90,
      }),
    );
    const bytes = await act(() => handle.current?.export());
    expect(new TextDecoder().decode(bytes?.slice(0, 5))).toBe("%PDF-");
  });

  it("refuses an assetsUrl with a query as soon as it renders in the browser", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(mount(<PdfEditor assetsUrl="/hm-test-assets/?v=2" />)).rejects.toThrow(
        TypeError,
      );
    } finally {
      errors.mockRestore();
    }
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
