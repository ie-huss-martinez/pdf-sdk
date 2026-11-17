import { applyVisualVariant, visualVariants } from "@hussmartinez/sdk-config/testing/visual";
import { expect, type Page, test } from "@playwright/test";
import { reportPdf } from "../../test/fixtures/pdfs.js";

/**
 * The editor's designed states, as screenshots (sdk-core ADR 0048). Each is
 * captured in light and dark, compact and comfortable, on the built Vite
 * example as a host renders it, with its assets inlined.
 *
 * | State | What it shows |
 * |---|---|
 * | `empty` | The start area, before a PDF is open, with only the open tool enabled |
 * | `open` | The report fixture: its pages as thumbnails and in the viewer, focus on the document |
 * | `rotated` | The first page rotated from the keyboard, with Undo enabled |
 * | `error` | A file that isn't a PDF, and the catalogue's text for it |
 * | `replace-error` | A document still open after a replacement failed, with the header's alert |
 *
 * No state is masked: every one renders a fixture generated in code, at a
 * fixed time, and the editor shows no time or random value. Pages are drawn
 * by pdf.js in the SDK's own worker, which is exact in the pinned Chromium.
 *
 * Not captured yet:
 *
 * - `opening`: the example can't hold an open in progress, and its
 *   indeterminate progress bar is a native animation.
 * - File policy warnings: the example sets no policy that reaches them.
 * - The custom element: `./element` doesn't ship one yet.
 */

/** A fixed time, so nothing that reads the clock can vary (ADR 0048). */
const NOW = new Date("2026-11-17T12:00:00Z");
const ORIGIN = "http://localhost:4320";

type State = (page: Page) => Promise<void>;

/** Chooses a file with the start button's picker, as a user would. */
async function choose(page: Page, name: string, buffer: Buffer): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Choose (a|another) PDF$/ }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer });
}

/**
 * Waits until every page in view has finished drawing: each thumbnail, the
 * viewer's first page, and nothing in the editor still busy. A page keeps
 * its last drawing until a redraw is ready, so `wide` waits for the first
 * page's redraw after a rotation.
 */
async function drawn(page: Page, { wide = false } = {}): Promise<void> {
  const firsts = [
    page.locator(".hm-pdf-thumbnail-canvas").first(),
    page.locator(".hm-pdf-page-canvas").first(),
  ];
  for (const canvas of firsts) {
    // The first drawing starts the render worker and pdf.js, which takes
    // longer than the default 5 s on a loaded machine.
    await expect
      .poll(
        () =>
          canvas.evaluate((element, landscape) => {
            const { width, height } = element as HTMLCanvasElement;
            return width > 0 && width > height === landscape;
          }, wide),
        { timeout: 30_000 },
      )
      .toBe(true);
  }
  await expect
    .poll(() =>
      page
        .locator(".hm-pdf-thumbnail-canvas")
        .evaluateAll((canvases) =>
          canvases.every((canvas) => (canvas as HTMLCanvasElement).width > 0),
        ),
    )
    .toBe(true);
  await expect(
    page.locator('.hm-pdf-editor[aria-busy="true"], .hm-pdf-editor [aria-busy="true"]'),
  ).toHaveCount(0);
}

const opened: State = async (page) => {
  await choose(page, "report.pdf", Buffer.from(await reportPdf()));
  await expect(page.getByRole("listbox", { name: "Pages" }).getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Document" })).toBeFocused();
  await drawn(page);
};

const STATES: Readonly<Record<string, State>> = {
  empty: async (page) => {
    await expect(page.getByRole("button", { name: "Choose a PDF" })).toBeVisible();
  },
  open: opened,
  rotated: async (page) => {
    await opened(page);
    // The shortcut rotates the current page clockwise, and says so.
    await page.keyboard.press("]");
    await expect(page.locator(".hm-announcer [aria-live=polite]")).toHaveText("Rotated 1 page.");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await drawn(page, { wide: true });
  },
  error: async (page) => {
    await choose(page, "notes.pdf", Buffer.from("just some text"));
    await expect(page.getByRole("button", { name: "Choose another PDF" })).toBeFocused();
    await expect(page.locator(".hm-pdf-editor-start .hm-pdf-editor-alert")).toBeVisible();
  },
  "replace-error": async (page) => {
    await opened(page);
    // The toolbar's open tool, which stays available with a document open.
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open a PDF" }).click();
    await (await chooser).setFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("just some text"),
    });
    await expect(page.locator(".hm-pdf-editor-header .hm-pdf-editor-alert")).toBeVisible();
    await drawn(page);
  },
};

for (const [state, reach] of Object.entries(STATES)) {
  for (const variant of visualVariants) {
    test(`${state}, ${variant.name}`, async ({ page }) => {
      // No request may leave the page's origin (sdk-core ADR 0012).
      const foreign: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (!["http:", "https:"].includes(url.protocol)) return;
        if (url.origin !== ORIGIN) foreign.push(request.url());
      });
      await page.clock.install({ time: NOW });
      await page.goto("/");
      await applyVisualVariant(page, variant);
      await reach(page);
      // The pointer rests outside the editor, so no hover styles show.
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${state}-${variant.name}.png`);
      expect(foreign).toEqual([]);
    });
  }
}
