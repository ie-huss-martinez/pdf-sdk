import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { assetHungryPdf, encryptedPdf, reportPdf } from "../../../test/fixtures/pdfs.js";
import { createPdfJsEngine } from "./pdfjs-engine.js";

type Recorded = { url: string; type: string };

/** Records every request the callback causes, from the page and its workers. */
async function requestsDuring(callback: () => Promise<void>): Promise<Recorded[]> {
  await commands.startRecordingRequests();
  try {
    await callback();
  } finally {
    // Let in-flight requests surface before stopping.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return commands.stopRecordingRequests();
}

/**
 * The SDK's own code: same-origin script loads. In an application these are
 * the chunks its bundler emitted from the package, such as the data file a
 * document needs; here, the test server's modules. Anything else, including
 * a fetch, an XHR or another origin, is a request the SDK made for data.
 */
const isOwnCode = ({ url, type }: Recorded) =>
  type === "script" && new URL(url).origin === location.origin;

describe("the recorder", () => {
  // Without these, a blind recorder would make the tests below pass vacuously.
  it("sees requests from the page", async () => {
    const requests = await requestsDuring(async () => {
      await fetch("/hm-recorder-probe-page").catch(() => {});
    });
    expect(requests).toContainEqual({
      url: new URL("/hm-recorder-probe-page", location.href).href,
      type: "fetch",
    });
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
    expect(requests.map((request) => request.url)).toContain(probe);
  });
});

describe("the pdf.js engine makes no requests (ADR 0002, ADR 0012)", () => {
  it("while opening, reading and rendering documents", async () => {
    const asked: string[] = [];
    const engine = createPdfJsEngine({
      _onDataRequest: (kind, filename) => asked.push(`${kind} ${filename}`),
    });
    const canvas = document.createElement("canvas");
    // Load the engine's code and start its worker before recording.
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

    expect(requests.filter((request) => !isOwnCode(request))).toEqual([]);
    // The hostile page really did make pdf.js want external data, which the
    // SDK served from its own bundled modules instead of fetching it. (Its JPX
    // image is rejected before pdf.js loads OpenJPEG; binary-data.test.ts
    // covers serving that decoder.)
    expect(asked).toEqual(
      expect.arrayContaining(["cMapUrl UniJIS-UCS2-H.bcmap", "wasmUrl jbig2.wasm"]),
    );
  });
});

describe("the pdf.js engine with self-hosted assets (docs/adr/0006, docs/adr/0007)", () => {
  it("requests only files under assetsUrl, including ICC colour data", async () => {
    // The test server serves exactly what the build writes to dist/assets.
    const assetsUrl = new URL("/hm-test-assets/", location.href).href;
    const engine = createPdfJsEngine({ assetsUrl });
    const canvas = document.createElement("canvas");
    const requests = await requestsDuring(async () => {
      const opened = await engine.open(assetHungryPdf());
      await opened.renderPage(0, canvas, { scale: 1 });
      await opened.getTextContent(0);
      await opened.destroy();
    });
    await engine.destroy();

    const outside = requests.filter(
      (request) => !isOwnCode(request) && !request.url.startsWith(assetsUrl),
    );
    expect(outside).toEqual([]);
    const paths = requests
      .filter(({ url }) => url.startsWith(assetsUrl))
      .map(({ url }) => url.slice(assetsUrl.length));
    expect(paths).toEqual(
      expect.arrayContaining([
        "pdfjs/build/pdf.worker.min.mjs",
        "pdfjs/cmaps/UniJIS-UCS2-H.bcmap",
        "pdfjs/wasm/jbig2.wasm",
        "pdfjs/wasm/qcms_bg.wasm",
        "pdfjs/iccs/CGATS001Compat-v2-micro.icc",
      ]),
    );
  });
});
