import { abortError, throwIfAborted } from "../../src/core/errors/abort.js";
import { assertPageIndex, copyBytes } from "../../src/core/model/bytes.js";
import { safeLinkUrl } from "../../src/core/model/links.js";
import {
  addRotation,
  PDF_MAX_CANVAS_PIXELS,
  type PdfCallOptions,
  type PdfDocumentHandle,
  type PdfEngine,
  PdfError,
  type PdfRenderOptions,
} from "../../src/index.js";
import { decodeFakePdf, type FakePdf } from "./fake-pdf.js";

/** Rejects as soon as the signal aborts, so callers see cancellation promptly. */
function settle<Value>(value: () => Value, options?: PdfCallOptions): Promise<Value> {
  throwIfAborted(options?.signal);
  return Promise.resolve().then(() => {
    throwIfAborted(options?.signal);
    return value();
  });
}

class FakeDocument implements PdfDocumentHandle {
  #destroyed = false;
  private readonly pdf: FakePdf;

  constructor(pdf: FakePdf) {
    this.pdf = pdf;
  }

  get pageCount(): number {
    return this.pdf.pages.length;
  }

  getPage(pageIndex: number, options?: PdfCallOptions) {
    return this.#run(pageIndex, options, (page) => ({
      width: page.width,
      height: page.height,
      rotation: page.rotation ?? 0,
    }));
  }

  renderPage(pageIndex: number, canvas: HTMLCanvasElement, options: PdfRenderOptions) {
    return this.#run(pageIndex, options, (page) => {
      const rotation = addRotation(page.rotation ?? 0, options.rotation ?? 0);
      const turned = rotation === 90 || rotation === 270;
      const cssWidth = (turned ? page.height : page.width) * options.scale;
      const cssHeight = (turned ? page.width : page.height) * options.scale;
      const wanted = options.pixelRatio ?? 1;
      const fits = Math.sqrt(PDF_MAX_CANVAS_PIXELS / (cssWidth * cssHeight));
      const ratio = Math.min(wanted, fits);
      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(cssHeight * ratio);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    });
  }

  getTextContent(pageIndex: number, options?: PdfCallOptions) {
    return this.#run(pageIndex, options, (page) => ({
      items: page.text
        ? [
            {
              text: page.text,
              rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.02 },
              angle: 0,
              endOfLine: true,
            },
          ]
        : [],
    }));
  }

  getFormFields(pageIndex: number, options?: PdfCallOptions) {
    return this.#run(pageIndex, options, () =>
      (this.pdf.fields ?? [])
        .filter((field) => field.page === pageIndex)
        .map(({ name, type, rect, value }) => ({ name, type, rect, value, readOnly: false })),
    );
  }

  getLinks(pageIndex: number, options?: PdfCallOptions) {
    return this.#run(pageIndex, options, (page) =>
      (page.links ?? []).flatMap(({ rect, url }) => {
        const safe = safeLinkUrl(url);
        return safe ? [{ rect, url: safe }] : [];
      }),
    );
  }

  async destroy(): Promise<void> {
    this.#destroyed = true;
  }

  #run<Value>(
    pageIndex: number,
    options: PdfCallOptions | undefined,
    read: (page: FakePdf["pages"][number]) => Value,
  ): Promise<Value> {
    if (this.#destroyed) {
      return Promise.reject(new PdfError("WORKER_TERMINATED", "The document was destroyed."));
    }
    try {
      assertPageIndex(pageIndex, this.pageCount);
    } catch (error) {
      return Promise.reject(error);
    }
    return settle(() => read(this.pdf.pages[pageIndex] as FakePdf["pages"][number]), options);
  }
}

/**
 * An in-memory {@link PdfEngine} over fake PDF bytes, for unit tests of the
 * session and the editor. It passes the engine's contract suite.
 */
export function createFakeEngine(): PdfEngine {
  let destroyed = false;
  return {
    open(source, options) {
      if (destroyed) {
        return Promise.reject(new PdfError("WORKER_TERMINATED", "The engine was destroyed."));
      }
      if (options?.signal?.aborted) {
        return Promise.reject(abortError(options.signal));
      }
      // Copy first, as a real engine must, unless the caller transfers.
      const bytes = options?.transfer
        ? source instanceof Uint8Array
          ? source
          : new Uint8Array(source)
        : copyBytes(source);
      return settle(() => {
        const pdf = decodeFakePdf(bytes);
        if (!pdf) {
          throw new PdfError("INVALID_PDF", "Not a fake PDF.");
        }
        if (pdf.password !== undefined) {
          throw new PdfError("PASSWORD_REQUIRED", "The fake PDF is encrypted.");
        }
        return new FakeDocument(pdf);
      }, options);
    },
    async destroy() {
      destroyed = true;
    },
  };
}
