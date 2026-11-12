import { act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../test/fakes/fake-engine.js";
import { encodeFakePdf } from "../../../test/fakes/fake-pdf.js";
import { LINKS, reportPdf, SAFE_LINKS } from "../../../test/fixtures/pdfs.js";
import { createPdfJsEngine } from "../../adapters/pdfjs/pdfjs-engine.js";
import type { PdfEngine } from "../../core/ports/pdf-engine.js";
import { createPdfSession, type PdfSession } from "../../core/session/session.js";
import stylesUrl from "../../styles.css?url";
import { PdfSessionProvider } from "../PdfSessionProvider.js";
import { PdfViewer } from "./PdfViewer.js";

// Tells React these tests wrap updates in act(), as a test environment does.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function loadStyles(): Promise<void> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = stylesUrl;
  await new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    document.head.append(link);
  });
  cleanups.push(() => link.remove());
}

/** Mounts a tree in a 800 × 600 box, with the package's styles. */
async function mount(tree: ReactNode): Promise<HTMLElement> {
  await loadStyles();
  const container = document.createElement("div");
  container.style.cssText = "width: 800px; height: 600px; display: grid;";
  document.body.append(container);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(tree);
  });
  cleanups.push(() => {
    act(() => root?.unmount());
    container.remove();
  });
  return container;
}

function fakeSession(pageCount: number): { session: PdfSession; bytes: Uint8Array } {
  const bytes = encodeFakePdf({
    pages: Array.from({ length: pageCount }, (_, index) => ({
      width: 600,
      height: 800,
      text: `Text of page ${index + 1}`,
      links:
        index === 0
          ? LINKS.map((url, at) => ({
              rect: { x: 0.1, y: 0.1 + at * 0.05, width: 0.4, height: 0.04 },
              url,
            }))
          : [],
    })),
  });
  return { session: createPdfSession({ engine: createFakeEngine() }), bytes };
}

/** Waits for a number of animation frames, so observers have reported. */
const frames = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
};

const viewer = (session: PdfSession) => (
  <PdfSessionProvider session={session}>
    <PdfViewer />
  </PdfSessionProvider>
);

describe("PdfViewer", () => {
  it("is a focusable, labelled region, with a message while nothing is open", async () => {
    const { session } = fakeSession(1);
    const container = await mount(viewer(session));
    const region = container.querySelector("section");
    expect(region?.getAttribute("aria-label")).toBe("Document");
    expect(region?.tabIndex).toBe(0);
    expect(container.textContent).toContain("No document is open.");
  });

  it("draws the pages near the viewport, each labelled, with selectable text", async () => {
    const { session, bytes } = fakeSession(3);
    const container = await mount(viewer(session));
    await act(() => session.open(bytes));
    const pages = [...container.querySelectorAll<HTMLElement>(".hm-pdf-page")];
    expect(pages.map((page) => page.getAttribute("aria-label"))).toEqual([
      "Page 1 of 3",
      "Page 2 of 3",
      "Page 3 of 3",
    ]);
    await vi.waitFor(() => {
      expect(pages[0]?.getAttribute("aria-busy")).toBe("false");
      expect(pages[0]?.querySelector("canvas")?.width).toBeGreaterThan(0);
      expect(pages[0]?.querySelector(".hm-pdf-text-layer")?.textContent).toContain(
        "Text of page 1",
      );
    });
    expect(pages[0]?.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders only safe links, labelled with where they really go", async () => {
    const { session, bytes } = fakeSession(1);
    const container = await mount(viewer(session));
    await act(() => session.open(bytes));
    await vi.waitFor(() => expect(container.querySelectorAll("a").length).toBeGreaterThan(0));
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((anchor) => anchor.href).sort()).toEqual(
      SAFE_LINKS.map((url) => new URL(url).href).sort(),
    );
    for (const anchor of anchors) {
      expect(anchor.rel).toBe("noopener noreferrer");
      expect(anchor.referrerPolicy).toBe("no-referrer");
    }
    const labels = anchors.map((anchor) => anchor.textContent);
    expect(labels).toContain("Link to example.com, opens in a new tab");
    expect(labels).toContain("Email team@example.com");
    expect(container.innerHTML).not.toMatch(/javascript:|evil\.example|ftp:|tel:/);
  });

  it("checks links again itself, whatever the engine returns (ADR 0012)", async () => {
    // An engine that breaks the contract and reports unsafe links.
    const fake = createFakeEngine();
    const careless: PdfEngine = {
      async open(source, options) {
        const document = await fake.open(source, options);
        return {
          pageCount: document.pageCount,
          getPage: document.getPage.bind(document),
          renderPage: document.renderPage.bind(document),
          getTextContent: document.getTextContent.bind(document),
          getFormFields: document.getFormFields.bind(document),
          destroy: document.destroy.bind(document),
          getLinks: async () => [
            { rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, url: "javascript:alert(1)" },
            {
              rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
              url: "https://bank.example@evil.example/",
            },
            { rect: { x: 0.1, y: 0.3, width: 0.2, height: 0.05 }, url: "https://example.com/" },
          ],
        };
      },
      destroy: () => fake.destroy(),
    };
    const session = createPdfSession({ engine: careless });
    const container = await mount(viewer(session));
    await act(() => session.open(encodeFakePdf({ pages: [{ width: 600, height: 800 }] })));
    await vi.waitFor(() => expect(container.querySelectorAll("a")).toHaveLength(1));
    expect(container.querySelector("a")?.href).toBe("https://example.com/");
  });

  it("turns a page's box and its text layer with the plan's rotation", async () => {
    const { session, bytes } = fakeSession(1);
    const container = await mount(viewer(session));
    await act(() => session.open(bytes));
    const page = () => container.querySelector<HTMLElement>(".hm-pdf-page");
    await vi.waitFor(() => expect(page()?.querySelector(".hm-pdf-text-layer")).not.toBeNull());
    const before = page()?.getBoundingClientRect();
    const [first] = session.getSnapshot().plan.pages;
    await act(() =>
      session.execute({ type: "pdf.rotatePages", pages: [first?.key as string], angle: 90 }),
    );
    await vi.waitFor(() => {
      const after = page()?.getBoundingClientRect();
      expect(after?.width).toBeCloseTo(before?.width ?? 0, 0);
      expect(after?.height).toBeCloseTo(((before?.width ?? 0) * 600) / 800, 0);
      expect(page()?.querySelector<HTMLElement>(".hm-pdf-text-layer")?.style.transform).toMatch(
        /rotate\(90deg\)/,
      );
    });
  });

  it("reads and draws only nearby pages when it mounts with a document open", async () => {
    // The editor mounts the viewer once a document is open. Until the viewer
    // knows its width every page placeholder is empty, so no page may count
    // as near before then, or every page is read and drawn at once.
    const { session, bytes } = fakeSession(60);
    await session.open(bytes);
    const getPage = vi.spyOn(session, "getPage");
    const renderPage = vi.spyOn(session, "renderPage");
    const container = await mount(viewer(session));
    await vi.waitFor(() => expect(container.querySelector("canvas")?.width).toBeGreaterThan(0));
    await frames(5);
    expect(getPage.mock.calls.length).toBeLessThan(10);
    expect(renderPage.mock.calls.length).toBeLessThan(10);
  });

  it("lands on the requested page however late page sizes arrive", async () => {
    // Pages are laid out with an estimate until the first is measured. A
    // navigation that runs before then must stay on its page when the real
    // sizes arrive and every page above it grows, in every engine, with or
    // without native scroll anchoring.
    const { session, bytes } = fakeSession(30);
    await session.open(bytes);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getPage = session.getPage.bind(session);
    vi.spyOn(session, "getPage").mockImplementation(async (key, options) => {
      await gate;
      return getPage(key, options);
    });
    const container = await mount(viewer(session));
    const region = container.querySelector("section") as HTMLElement;
    const offsetOf = (key: string) =>
      (region.querySelector(`[data-hm-page-key="${key}"]`) as HTMLElement).getBoundingClientRect()
        .top - region.getBoundingClientRect().top;

    await act(async () => session.goToPage("p30"));
    await frames(2);
    const before = offsetOf("p30");
    expect(Math.abs(before)).toBeLessThan(40);

    release();
    await vi.waitFor(() =>
      expect([...region.querySelectorAll("canvas")].some((canvas) => canvas.width > 0)).toBe(true),
    );
    await frames(5);
    // The estimate (612 by 792) gave way to the real size (600 by 800), so
    // every page above grew, and the page stayed where it was.
    // Scroll positions round to whole pixels in some engines.
    expect(Math.abs(offsetOf("p30") - before)).toBeLessThan(2);
  });

  it("keeps the user's place while sizes above it change", async () => {
    const { session, bytes } = fakeSession(30);
    await session.open(bytes);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getPage = session.getPage.bind(session);
    vi.spyOn(session, "getPage").mockImplementation(async (key, options) => {
      await gate;
      return getPage(key, options);
    });
    const container = await mount(viewer(session));
    const region = container.querySelector("section") as HTMLElement;
    const page = region.querySelector('[data-hm-page-key="p20"]') as HTMLElement;
    // The viewer lays its pages out once it knows its width.
    await vi.waitFor(() => expect(page.offsetTop).toBeGreaterThan(0));
    await act(async () => {
      region.scrollTop = page.offsetTop + 100;
    });
    await frames(2);
    const before = page.getBoundingClientRect().top - region.getBoundingClientRect().top;

    release();
    await vi.waitFor(() =>
      expect([...region.querySelectorAll("canvas")].some((canvas) => canvas.width > 0)).toBe(true),
    );
    await frames(5);
    const after = page.getBoundingClientRect().top - region.getBoundingClientRect().top;
    expect(Math.abs(after - before)).toBeLessThan(2);
  });

  it("draws only pages near the viewport, and gives back pixels of pages scrolled away", async () => {
    const { session, bytes } = fakeSession(40);
    const container = await mount(viewer(session));
    await act(() => session.open(bytes));
    const canvases = () => [...container.querySelectorAll<HTMLCanvasElement>("canvas")];
    await vi.waitFor(() => expect(canvases()[0]?.width).toBeGreaterThan(0));
    const drawn = () => canvases().filter((canvas) => canvas.width > 0).length;
    expect(drawn()).toBeLessThan(10);

    const region = container.querySelector("section") as HTMLElement;
    await act(async () => {
      region.scrollTop = region.scrollHeight;
    });
    await vi.waitFor(() => {
      expect(canvases().at(-1)?.width).toBeGreaterThan(0);
      expect(canvases()[0]?.width).toBe(0);
    });
    expect(drawn()).toBeLessThan(10);
  });

  it("renders on a server and hydrates without warnings (ADR 0007)", async () => {
    await loadStyles();
    const { session } = fakeSession(1);
    const html = renderToString(viewer(session));
    expect(html).toContain("No document is open.");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, viewer(session));
    });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root?.unmount());
    container.remove();
  });

  it("shows a real document's text and links with pdf.js", async () => {
    const engine = createPdfJsEngine();
    const session = createPdfSession({ engine });
    cleanups.push(() => engine.destroy());
    const container = await mount(viewer(session));
    const file = new Blob([(await reportPdf()) as Uint8Array<ArrayBuffer>]);
    await act(() => session.open(file));
    await vi.waitFor(
      () => {
        expect(container.querySelector(".hm-pdf-text-layer")?.textContent).toContain(
          "Quarterly report",
        );
        expect(container.querySelectorAll(".hm-pdf-page")[0]?.querySelectorAll("a")).toHaveLength(
          SAFE_LINKS.length,
        );
      },
      { timeout: 10_000 },
    );
  });
});
