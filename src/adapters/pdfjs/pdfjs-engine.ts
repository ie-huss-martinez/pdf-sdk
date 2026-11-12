import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PDFWorker } from "pdfjs-dist";
import { abortError, throwIfAborted } from "../../core/errors/abort.js";
import { PdfError } from "../../core/errors/pdf-error.js";
import { pdfLimitDefinitions } from "../../core/errors/pdf-limits.js";
import { assertPageIndex, copyBytes } from "../../core/model/bytes.js";
import type {
  PdfBytes,
  PdfFormField,
  PdfPageInfo,
  PdfTextContent,
  PdfTextItem,
} from "../../core/model/document.js";
import { addRotation, type PdfRect, type PdfRotation } from "../../core/model/geometry.js";
import type { PdfCallOptions, PdfTransferOptions } from "../../core/ports/options.js";
import {
  PDF_MAX_CANVAS_PIXELS,
  type PdfDocumentHandle,
  type PdfEngine,
  type PdfRenderOptions,
} from "../../core/ports/pdf-engine.js";
import { createRefusingDataFactory, NO_NETWORK_URL } from "./binary-data.js";
import { fromPdfJsError } from "./errors.js";

type PdfJs = typeof import("pdfjs-dist");
type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;

/** The fields of pdf.js's text items this adapter reads. */
interface PdfJsTextItem {
  readonly str: string;
  readonly transform: readonly number[];
  readonly width: number;
  readonly hasEOL: boolean;
}

/**
 * Converts a rectangle in PDF user space to fractions of the unrotated page,
 * from the top-left corner, clamped to the page (ADR 0003).
 */
function toPageRect(viewport: PageViewport, box: readonly number[]): PdfRect {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = box;
  const [ax = 0, ay = 0] = viewport.convertToViewportPoint(x1, y1) as number[];
  const [bx = 0, by = 0] = viewport.convertToViewportPoint(x2, y2) as number[];
  const left = clamp(Math.min(ax, bx) / viewport.width);
  const top = clamp(Math.min(ay, by) / viewport.height);
  return {
    x: left,
    y: top,
    width: clamp(Math.max(ax, bx) / viewport.width) - left,
    height: clamp(Math.max(ay, by) / viewport.height) - top,
  };
}

/**
 * Options for {@link createPdfJsEngine}.
 *
 * @public
 */
export interface PdfJsEngineOptions {
  /**
   * The URL of pdf.js's worker on your own origin, for Content Security
   * Policies that don't allow `blob:` workers. By default the worker is
   * inlined, which needs `worker-src blob:` (ADR 0002).
   */
  readonly workerUrl?: string | URL;
  /**
   * The largest image pdf.js decodes, in pixels. Larger images are left
   * unpainted. Defaults to the `maxImagePixels` limit, 100 megapixels.
   */
  readonly maxImagePixels?: number;
  /**
   * Called for every data file pdf.js asks for. For tests.
   *
   * @internal
   */
  readonly _onDataRequest?: (
    kind: "cMapUrl" | "standardFontDataUrl" | "wasmUrl",
    filename: string,
  ) => void;
}

/** How long a cancelled open may take to stop before its worker is terminated (ADR 0018). */
const CANCEL_TIMEOUT = 1_000;

/**
 * Creates the SDK's {@link PdfEngine}, backed by pdf.js (ADR 0001, ADR 0002).
 *
 * Nothing loads until the first `open()`: then pdf.js's display layer is
 * imported, and its worker starts, from the inlined copy or `workerUrl`.
 * pdf.js runs without scripting or XFA, and never fetches fonts, CMaps or
 * decoders. Every document the engine opens shares one worker.
 *
 * @example
 * ```ts
 * const engine = createPdfJsEngine();
 * const document = await engine.open(await file.arrayBuffer(), { signal });
 * await document.renderPage(0, canvas, { scale: 1.5, pixelRatio: devicePixelRatio });
 * ```
 *
 * @public
 */
export function createPdfJsEngine(options: PdfJsEngineOptions = {}): PdfEngine {
  return new PdfJsEngine(options);
}

/**
 * One worker, and everything that fails with it. When the worker crashes or
 * has to be terminated, every call waiting on it rejects, and the engine
 * starts a new one on the next open.
 */
class WorkerHost {
  readonly pdfWorker: PDFWorker;
  #worker: Worker;
  #waiting = new Set<(error: PdfError) => void>();
  #failure: PdfError | undefined;

  constructor(worker: Worker, pdfWorker: PDFWorker) {
    this.#worker = worker;
    this.pdfWorker = pdfWorker;
    const crash = (event: Event) => {
      // Handled here, so the error isn't also reported to the console.
      event.preventDefault();
      this.fail(new PdfError("WORKER_CRASHED", "The PDF render worker failed."));
    };
    worker.addEventListener("error", crash);
    worker.addEventListener("messageerror", crash);
  }

  get failure(): PdfError | undefined {
    return this.#failure;
  }

  /** Rejects with the worker's failure, if it fails while the returned function hasn't been called. */
  watch(reject: (error: PdfError) => void): () => void {
    if (this.#failure) {
      reject(this.#failure);
      return () => {};
    }
    this.#waiting.add(reject);
    return () => this.#waiting.delete(reject);
  }

  fail(error: PdfError): void {
    if (this.#failure) return;
    this.#failure = error;
    this.#worker.terminate();
    this.pdfWorker.destroy();
    for (const reject of this.#waiting) reject(error);
    this.#waiting.clear();
  }
}

/**
 * Waits for a pdf.js promise, rejecting at once when the signal aborts or the
 * worker fails, and mapping pdf.js's errors to `PdfError`.
 */
function settle<Value>(
  host: WorkerHost,
  promise: Promise<Value>,
  options: { signal?: AbortSignal | undefined; onAbort?: () => void; message: string },
): Promise<Value> {
  const { signal } = options;
  return new Promise<Value>((resolve, reject) => {
    if (signal?.aborted) {
      options.onAbort?.();
      reject(abortError(signal));
      return;
    }
    const abort = () => {
      options.onAbort?.();
      reject(abortError(signal as AbortSignal));
    };
    signal?.addEventListener("abort", abort, { once: true });
    const unwatch = host.watch(reject);
    promise.then(resolve, (reason: unknown) => reject(fromPdfJsError(reason, options.message)));
    // Settling twice is harmless; the first outcome wins.
    void promise
      .catch(() => {})
      .finally(() => {
        signal?.removeEventListener("abort", abort);
        unwatch();
      });
  });
}

/** pdf.js transfers the bytes it's given, so it gets a copy unless the caller transfers. */
function takeBytes(source: PdfBytes, transfer: boolean | undefined): Uint8Array {
  if (transfer) {
    const view = source instanceof Uint8Array ? source : new Uint8Array(source);
    const whole = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength;
    if (whole && view.buffer instanceof ArrayBuffer) return view;
  }
  return copyBytes(source);
}

function normalizeRotation(rotation: number): PdfRotation {
  return addRotation(0, Number.isInteger(rotation) && rotation % 90 === 0 ? rotation : 0);
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

class PdfJsEngine implements PdfEngine {
  #options: PdfJsEngineOptions;
  #runtime: Promise<PdfJs> | undefined;
  #host: WorkerHost | undefined;
  #documents = new Set<PdfJsDocument>();
  #destroyed = false;

  constructor(options: PdfJsEngineOptions) {
    this.#options = options;
  }

  async open(source: PdfBytes, options: PdfTransferOptions = {}): Promise<PdfDocumentHandle> {
    if (this.#destroyed) {
      throw new PdfError("WORKER_TERMINATED", "The PDF engine was destroyed.");
    }
    throwIfAborted(options.signal);
    const data = takeBytes(source, options.transfer);
    this.#runtime ??= import("./runtime.js").then((module) => module.pdfjs as PdfJs);
    const pdfjs = await this.#runtime;
    throwIfAborted(options.signal);
    const host = await this.#ensureHost(pdfjs);

    const task = pdfjs.getDocument({
      data,
      worker: host.pdfWorker,
      // Hardening (ADR 0001, ADR 0002): no XFA, no data fetched by pdf.js
      // itself, and decoders that can't reach the network.
      enableXfa: false,
      useWorkerFetch: false,
      BinaryDataFactory: createRefusingDataFactory(this.#options._onDataRequest),
      useWasm: true,
      wasmUrl: NO_NETWORK_URL,
      maxImageSize: this.#options.maxImagePixels ?? pdfLimitDefinitions.maxImagePixels.default,
      stopAtErrors: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    try {
      const proxy = await settle(host, task.promise, {
        signal: options.signal,
        onAbort: () => this.#cancel(task, host),
        message: "The PDF couldn't be opened.",
      });
      const document = new PdfJsDocument(pdfjs, proxy, task, host, () =>
        this.#documents.delete(document),
      );
      this.#documents.add(document);
      return document;
    } catch (error) {
      void task.destroy().catch(() => {});
      throw error;
    }
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    await Promise.all([...this.#documents].map((document) => document.destroy()));
    this.#host?.fail(new PdfError("WORKER_TERMINATED", "The PDF engine was destroyed."));
    this.#host = undefined;
  }

  async #ensureHost(pdfjs: PdfJs): Promise<WorkerHost> {
    if (this.#host && !this.#host.failure) return this.#host;
    let worker: Worker;
    try {
      worker = this.#options.workerUrl
        ? new Worker(this.#options.workerUrl, { type: "module", name: "hm-pdf-render" })
        : (await import("./inline-worker.js")).createInlineWorker();
    } catch (cause) {
      throw new PdfError("WORKER_START_FAILED", "The PDF render worker couldn't start.", {
        cause,
      });
    }
    this.#host = new WorkerHost(worker, pdfjs.PDFWorker.create({ port: worker }));
    return this.#host;
  }

  /** Stops a cancelled open, and terminates the worker if pdf.js doesn't stop in time. */
  #cancel(task: PDFDocumentLoadingTask, host: WorkerHost): void {
    const timer = setTimeout(
      () =>
        host.fail(
          new PdfError("WORKER_TERMINATED", "The worker was stopped to cancel an operation."),
        ),
      CANCEL_TIMEOUT,
    );
    void task
      .destroy()
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }
}

class PdfJsDocument implements PdfDocumentHandle {
  readonly pageCount: number;
  #pdfjs: PdfJs;
  #proxy: PDFDocumentProxy;
  #task: PDFDocumentLoadingTask;
  #host: WorkerHost;
  #onDestroy: () => void;
  #destroyed = false;

  constructor(
    pdfjs: PdfJs,
    proxy: PDFDocumentProxy,
    task: PDFDocumentLoadingTask,
    host: WorkerHost,
    onDestroy: () => void,
  ) {
    this.#pdfjs = pdfjs;
    this.#proxy = proxy;
    this.#task = task;
    this.#host = host;
    this.#onDestroy = onDestroy;
    this.pageCount = proxy.numPages;
  }

  async getPage(pageIndex: number, options: PdfCallOptions = {}): Promise<PdfPageInfo> {
    const page = await this.#page(pageIndex, options);
    const { width, height } = page.getViewport({ scale: 1, rotation: 0 });
    return { width, height, rotation: normalizeRotation(page.rotate) };
  }

  async renderPage(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    options: PdfRenderOptions,
  ): Promise<void> {
    if (!(options.scale > 0) || !Number.isFinite(options.scale)) {
      throw new RangeError(
        `The render scale must be a positive number, received ${options.scale}.`,
      );
    }
    const page = await this.#page(pageIndex, options);
    const rotation = addRotation(normalizeRotation(page.rotate), options.rotation ?? 0);
    const viewport = page.getViewport({ scale: options.scale, rotation });
    const area = viewport.width * viewport.height;
    const wanted = Math.max(options.pixelRatio ?? 1, Number.MIN_VALUE);
    // Lower the resolution, never the CSS size, to stay within the canvas cap (ADR 0004).
    const ratio = Math.min(wanted, Math.sqrt(PDF_MAX_CANVAS_PIXELS / Math.max(area, 1)));
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new PdfError("UNSUPPORTED_ENVIRONMENT", "The browser can't draw on a canvas.", {
        details: { feature: "CanvasRenderingContext2D" },
      });
    }
    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
      annotationMode: this.#pdfjs.AnnotationMode.ENABLE,
    });
    try {
      await settle(this.#host, task.promise, {
        signal: options.signal,
        onAbort: () => task.cancel(),
        message: "The page couldn't be drawn.",
      });
    } finally {
      page.cleanup();
    }
  }

  async getTextContent(pageIndex: number, options: PdfCallOptions = {}): Promise<PdfTextContent> {
    const page = await this.#page(pageIndex, options);
    const content = await settle(this.#host, page.getTextContent(), {
      signal: options.signal,
      message: "The page's text couldn't be read.",
    });
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const { str, transform, width, hasEOL } = item as PdfJsTextItem;
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = transform;
      const fontHeight = Math.hypot(c, d);
      items.push({
        text: str,
        rect: toPageRect(viewport, [e, f, e + width, f + fontHeight]),
        angle: (Math.atan2(b, a) * 180) / Math.PI,
        endOfLine: hasEOL,
      });
    }
    return { items };
  }

  async getFormFields(
    pageIndex: number,
    options: PdfCallOptions = {},
  ): Promise<readonly PdfFormField[]> {
    const page = await this.#page(pageIndex, options);
    const annotations = (await settle(this.#host, page.getAnnotations({ intent: "display" }), {
      signal: options.signal,
      message: "The page's form fields couldn't be read.",
    })) as Array<Record<string, unknown>>;
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const fields = new Map<string, PdfFormField>();
    for (const annotation of annotations) {
      const name = annotation["fieldName"];
      if (annotation["subtype"] !== "Widget" || typeof name !== "string" || fields.has(name)) {
        continue;
      }
      const value = annotation["fieldValue"];
      const type =
        annotation["fieldType"] === "Tx"
          ? "text"
          : annotation["fieldType"] === "Btn" && annotation["checkBox"]
            ? "checkbox"
            : undefined;
      if (!type) continue;
      fields.set(name, {
        name,
        type,
        rect: toPageRect(viewport, annotation["rect"] as number[]),
        value:
          type === "text"
            ? typeof value === "string"
              ? value
              : ""
            : typeof value === "string" && value !== "" && value !== "Off",
        readOnly: annotation["readOnly"] === true,
      });
    }
    return [...fields.values()];
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#onDestroy();
    await this.#task.destroy().catch(() => {});
  }

  async #page(pageIndex: number, options: PdfCallOptions): Promise<PDFPageProxy> {
    if (this.#destroyed) {
      throw new PdfError("WORKER_TERMINATED", "The document was destroyed.");
    }
    assertPageIndex(pageIndex, this.pageCount);
    throwIfAborted(options.signal);
    return settle(this.#host, this.#proxy.getPage(pageIndex + 1), {
      signal: options.signal,
      message: "The page couldn't be read.",
    });
  }
}
