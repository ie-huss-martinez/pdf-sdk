import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { assetHungryPdf, encryptedPdf, reportPdf } from "../../../test/fixtures/pdfs.js";
import { NO_NETWORK_URL } from "./binary-data.js";
import { createPdfJsEngine } from "./pdfjs-engine.js";

/** Records every request the callback causes, from the page and its workers. */
async function requestsDuring(callback: () => Promise<void>): Promise<string[]> {
  await commands.startRecordingRequests();
  try {
    await callback();
  } finally {
    // Let in-flight requests surface before stopping.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return commands.stopRecordingRequests();
}

describe("the recorder", () => {
  // Without these, a blind recorder would make the tests below pass vacuously.
  it("sees requests from the page", async () => {
    const requests = await requestsDuring(async () => {
      await fetch("/hm-recorder-probe-page").catch(() => {});
    });
    expect(requests.some((url) => url.includes("hm-recorder-probe-page"))).toBe(true);
  });

  it("sees requests from a worker", async () => {
    // A blob worker can't resolve a relative URL, so the probe is absolute.
    const probe = new URL("/hm-recorder-probe-worker", location.href).href;
    const source = `fetch(${JSON.stringify(probe)}).finally(() => postMessage("done"));`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const requests = await requestsDuring(async () => {
      const worker = new Worker(url);
      await new Promise((resolve) => worker.addEventListener("message", resolve, { once: true }));
      worker.terminate();
    });
    URL.revokeObjectURL(url);
    expect(requests.some((request) => request.includes("hm-recorder-probe-worker"))).toBe(true);
  });
});

describe("the pdf.js engine makes no requests (ADR 0002, ADR 0012)", () => {
  it("while opening, reading and rendering documents", async () => {
    const asked: string[] = [];
    const engine = createPdfJsEngine({
      _onDataRequest: (kind, filename) => asked.push(`${kind} ${filename}`),
    });
    const canvas = document.createElement("canvas");
    // Load the engine's code and start its worker before recording, so only
    // what documents cause is recorded.
    await (await engine.open(await reportPdf())).destroy();

    const requests = await requestsDuring(async () => {
      for (const bytes of [await reportPdf(), assetHungryPdf()]) {
        const opened = await engine.open(bytes);
        for (let index = 0; index < opened.pageCount; index += 1) {
          await opened.renderPage(index, canvas, { scale: 1, pixelRatio: 2 });
          await opened.getTextContent(index);
          await opened.getFormFields(index);
        }
        await opened.destroy();
      }
      await engine.open(await encryptedPdf()).catch(() => {});
      await engine.open(new TextEncoder().encode("not a PDF")).catch(() => {});
    });
    await engine.destroy();

    // When a WebAssembly decoder isn't available, pdf.js tries to import a
    // JavaScript one from its wasmUrl. The SDK points that at a scheme no
    // browser can fetch, so the attempt fails without leaving the browser.
    // Anything else is a real request, and fails the test.
    const guarded = requests.filter((url) => url.startsWith(NO_NETWORK_URL));
    expect(requests.filter((url) => !url.startsWith(NO_NETWORK_URL))).toEqual([]);
    expect(guarded.every((url) => /^hm-pdf-no-network:\/\w+_nowasm_fallback\.js$/.test(url))).toBe(
      true,
    );
    // The hostile page really did make pdf.js want external data, which the
    // SDK refused instead of fetching.
    expect(asked).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^cMapUrl UniJIS-UCS2-H/),
        expect.stringMatching(/^wasmUrl jbig2\.wasm$/),
      ]),
    );
  });
});
