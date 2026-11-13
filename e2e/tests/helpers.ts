import { expect, type Page } from "@playwright/test";
import { JPX_COLOURS, JPX_IMAGE } from "../../test/fixtures/pdfs.js";

/**
 * A notice Firefox logs, as a warning, while pdf.js opens a document, in both
 * asset modes and for any PDF. It's about Firefox's own scheduling, not an
 * error, and nothing on the page goes wrong. It isn't caused by top-level
 * await (the SDK's chunks and pdf.js have none), fonts, file reading, module
 * workers or message channels, each of which was ruled out on its own; the
 * trigger inside pdf.js is still to be found (issue #32). It's kept apart, exactly, so
 * every other warning, such as React's hydration warnings, still fails.
 */
const FIREFOX_MICROTASK_NOTICE =
  /^\[JavaScript Warning: "The execution of microtasks on this page was reordered to avoid unsafe execution\." \{file: "[^"]+" line: 0\}\]$/;

/** What went wrong on a page while a test ran. */
export interface Problems {
  /** Console errors and warnings, such as React's hydration warnings. */
  readonly console: string[];
  /** Firefox's microtask notice, which is recorded but allowed. */
  readonly engineNotices: string[];
  /** Uncaught exceptions. */
  readonly errors: string[];
  /** Requests to any origin but the page's own (ADR 0012 in sdk-core). */
  readonly foreignRequests: string[];
  /** Every request to the page's own origin, by path. */
  readonly ownPaths: string[];
}

/** Records what a page does from now on. */
export function watch(page: Page, origin: string): Problems {
  const problems: Problems = {
    console: [],
    engineNotices: [],
    errors: [],
    foreignRequests: [],
    ownPaths: [],
  };
  page.on("console", (message) => {
    if (message.type() === "warning" && FIREFOX_MICROTASK_NOTICE.test(message.text())) {
      problems.engineNotices.push(message.text());
    } else if (message.type() === "error" || message.type() === "warning") {
      problems.console.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http")) return;
    if (url.origin === origin) problems.ownPaths.push(url.pathname);
    else problems.foreignRequests.push(request.url());
  });
  return problems;
}

/** Chooses a PDF with the editor's start button, as a user would, and waits for its pages. */
export async function openPdf(page: Page, bytes: Uint8Array, name = "document.pdf") {
  await page.locator('.hm-pdf-editor-start input[type="file"]').setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator(".hm-pdf-editor")).toHaveAttribute("data-hm-status", "ready");
  // The visible canvas takes a size only when a finished drawing is copied
  // in; aria-busy alone is also false before the page starts drawing.
  const first = page.locator(".hm-pdf-page").first();
  await expect
    .poll(() => first.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).width))
    .toBeGreaterThan(0);
  await expect(first).toHaveAttribute("aria-busy", "false");
}

/**
 * The colour at the middle of each quadrant of the JPEG 2000 fixture's image,
 * as drawn on the first page's canvas.
 */
export async function jpxQuadrants(
  page: Page,
): Promise<Record<keyof typeof JPX_COLOURS, number[]>> {
  return page
    .locator(".hm-pdf-page-canvas")
    .first()
    .evaluate((element, image) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      const sample = (column: number, row: number) => {
        const x = (image.x + image.width * (column + 0.5) * 0.5) * canvas.width;
        const y = (image.y + image.height * (row + 0.5) * 0.5) * canvas.height;
        return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
      };
      return {
        topLeft: sample(0, 0),
        topRight: sample(1, 0),
        bottomLeft: sample(0, 1),
        bottomRight: sample(1, 1),
      };
    }, JPX_IMAGE);
}

/**
 * Checks that the first page shows the JPEG 2000 image's four colours,
 * allowing for anti-aliasing. Once a page has drawn, it keeps showing that
 * drawing until a redraw is ready, so one look is enough.
 */
export async function expectJpxColours(page: Page): Promise<void> {
  const found = await jpxQuadrants(page);
  for (const [quadrant, colour] of Object.entries(JPX_COLOURS)) {
    const actual = found[quadrant as keyof typeof JPX_COLOURS];
    const close = actual.every((value, index) => Math.abs(value - (colour[index] ?? 0)) <= 8);
    expect(close, `${quadrant}: ${actual.join(", ")}`).toBe(true);
  }
}
