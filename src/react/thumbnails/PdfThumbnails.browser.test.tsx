import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { cleanUp, loadStyles, mount } from "../../../test/react.js";
import { createPdfSession, type PdfSession } from "../../core/session/session.js";
import { PdfSessionProvider } from "../PdfSessionProvider.js";
import { PdfViewer } from "../viewer/PdfViewer.js";
import { PdfThumbnails } from "./PdfThumbnails.js";

afterEach(cleanUp);

async function opened(pageCount: number): Promise<PdfSession> {
  const session = createPdfSession({ engine: createFakeEngine() });
  await session.open(
    encodeFakePdf({
      pages: Array.from({ length: pageCount }, () => ({ width: 600, height: 800 })),
    }),
  );
  return session;
}

const layout = (session: PdfSession, withViewer = false) => (
  <PdfSessionProvider session={session}>
    <PdfThumbnails />
    {withViewer ? <PdfViewer /> : null}
  </PdfSessionProvider>
);

/** Waits for a number of animation frames, so observers have reported. */
const frames = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
};

const SIDE_BY_SIDE =
  "width: 900px; height: 600px; display: grid; grid-template-columns: 160px 1fr;";

const options = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="option"]'),
];

describe("PdfThumbnails", () => {
  it("is a labelled, multi-selectable listbox with one tab stop", async () => {
    const session = await opened(3);
    const container = await mount(
      layout(session),
      "width: 160px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
    );
    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox?.getAttribute("aria-label")).toBe("Pages");
    expect(listbox?.getAttribute("aria-multiselectable")).toBe("true");
    expect(options(container).map((option) => option.getAttribute("aria-label"))).toEqual([
      "Page 1 of 3",
      "Page 2 of 3",
      "Page 3 of 3",
    ]);
    expect(options(container).map((option) => option.tabIndex)).toEqual([0, -1, -1]);
    expect(options(container)[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("is driven by the keyboard, with the selection following focus", async () => {
    const session = await opened(4);
    const container = await mount(
      layout(session),
      "width: 160px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
    );
    const snapshot = () => session.getSnapshot();
    options(container)[0]?.focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(snapshot()).toMatchObject({ selection: ["p2"], currentPage: "p2" });
    expect(document.activeElement).toBe(options(container)[1]);
    expect(options(container).map((option) => option.tabIndex)).toEqual([-1, 0, -1, -1]);

    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(snapshot().selection).toEqual(["p2", "p3", "p4"]);

    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    expect(snapshot().selection).toEqual(["p2", "p3", "p4"]);
    expect(document.activeElement).toBe(options(container)[2]);
    await userEvent.keyboard(" ");
    expect(snapshot().selection).toEqual(["p2", "p4"]);

    await userEvent.keyboard("{Control>}a{/Control}");
    expect(snapshot().selection).toEqual(["p1", "p2", "p3", "p4"]);
    await userEvent.keyboard("{Escape}");
    expect(snapshot().selection).toEqual(["p3"]);

    await userEvent.keyboard("{End}");
    expect(snapshot()).toMatchObject({ selection: ["p4"], currentPage: "p4" });
    await userEvent.keyboard("{Home}");
    expect(snapshot()).toMatchObject({ selection: ["p1"], currentPage: "p1" });
    expect(options(container)[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("selects with click, Ctrl + click and Shift + click", async () => {
    const session = await opened(5);
    const container = await mount(
      layout(session),
      "width: 160px; height: 900px; display: grid; grid-template-rows: minmax(0, 1fr);",
    );
    await userEvent.click(options(container)[1] as HTMLElement);
    expect(session.getSnapshot().selection).toEqual(["p2"]);
    await userEvent.keyboard("{Control>}");
    await userEvent.click(options(container)[3] as HTMLElement);
    await userEvent.keyboard("{/Control}");
    expect(session.getSnapshot().selection).toEqual(["p2", "p4"]);
    await userEvent.keyboard("{Shift>}");
    await userEvent.click(options(container)[4] as HTMLElement);
    await userEvent.keyboard("{/Shift}");
    expect(session.getSnapshot().selection).toEqual(["p4", "p5"]);
  });

  it("brings the chosen page into view in the viewer, and follows the viewer's scrolling", async () => {
    const session = await opened(30);
    const container = await mount(layout(session, true), SIDE_BY_SIDE);
    const viewer = container.querySelector("section") as HTMLElement;
    options(container)[0]?.focus();
    await userEvent.keyboard("{End}");
    await vi.waitFor(() => {
      const last = viewer.querySelector<HTMLElement>('[data-hm-page-key="p30"]');
      const top = (last?.getBoundingClientRect().top ?? 0) - viewer.getBoundingClientRect().top;
      expect(Math.abs(top)).toBeLessThan(80);
    });

    // Scrolling the viewer to the top makes page 1 current, which the thumbnails show.
    await act(async () => {
      viewer.scrollTop = 0;
    });
    await vi.waitFor(() => {
      expect(session.getSnapshot().currentPage).toBe("p1");
      expect(options(container)[0]?.getAttribute("aria-current")).toBe("true");
    });

    // Only a new request scrolls: other changes leave the viewer where the user put it.
    await act(async () => session.select(["p2"]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(viewer.scrollTop).toBeLessThan(100);
  });

  it("draws only the thumbnails near its viewport", async () => {
    // Until the list knows its width every thumbnail is empty, so none may
    // count as near before then, or every page is read and drawn at once.
    // Counting the session's reads and draws catches that even when the
    // observer has taken the pixels back by the time the test looks.
    const session = await opened(60);
    const getPage = vi.spyOn(session, "getPage");
    const renderPage = vi.spyOn(session, "renderPage");
    const container = await mount(
      layout(session),
      "width: 160px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
    );
    const canvases = () => [...container.querySelectorAll("canvas")];
    await vi.waitFor(() => expect(canvases()[0]?.width).toBeGreaterThan(0));
    await frames(5);
    expect(getPage.mock.calls.length).toBeLessThan(20);
    expect(renderPage.mock.calls.length).toBeLessThan(20);
    expect(canvases().filter((canvas) => canvas.width > 0).length).toBeLessThan(20);
  });

  it("renders on a server and hydrates without warnings (ADR 0007)", async () => {
    await loadStyles();
    const session = await opened(2);
    const tree = layout(session);
    const html = renderToString(tree);
    expect(html).toContain('role="listbox"');
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
