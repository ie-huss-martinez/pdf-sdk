import { checkFile, withProcessingTime } from "@hussmartinez/sdk-core";
import { asPdfError, throwIfAborted } from "../errors/abort.js";
import { PdfError } from "../errors/pdf-error.js";
import { type PdfFilePolicyOverrides, type PdfLimitName, pdfLimits } from "../errors/pdf-limits.js";
import { copyBytes } from "../model/bytes.js";
import type { PdfBytes, PdfFormField, PdfPageInfo, PdfTextContent } from "../model/document.js";
import { addRotation } from "../model/geometry.js";
import { EMPTY_PLAN, type PdfPlan, type PdfPlanPage } from "../model/plan.js";
import { applyCommands, type PdfCommand } from "../operations/commands.js";
import type { PdfCallOptions } from "../ports/options.js";
import type { PdfDocumentHandle, PdfEngine, PdfRenderOptions } from "../ports/pdf-engine.js";
import { History } from "./history.js";

/**
 * A source document the session holds: opened or inserted, never changed.
 *
 * @public
 */
export interface PdfSourceInfo {
  /** Unique within the session, and never reused. */
  readonly id: string;
  readonly pageCount: number;
  /** The size of its bytes. */
  readonly byteLength: number;
}

/**
 * A file policy warning: a value at or above a limit's warning threshold,
 * but within its maximum (ADR 0020). Show its text from
 * `warnings.<limit>` in the message catalogue, with `actual` as a parameter.
 *
 * @public
 */
export interface PdfWarning {
  readonly limit: PdfLimitName;
  readonly actual: number;
}

/**
 * What the session is doing.
 *
 * - `empty`: no document is open.
 * - `opening`: a document is being opened, replacing any other.
 * - `ready`: a document is open.
 * - `error`: no document is open, because the last open failed; `error`
 *   says why. A failed open while a document is open keeps that document,
 *   with the status `ready` and `error` set.
 *
 * @public
 */
export type PdfSessionStatus = "empty" | "opening" | "ready" | "error";

/**
 * The session's state at one moment. Snapshots are immutable: every change
 * makes a new one, so `useSyncExternalStore` and other subscribers can
 * compare them by identity.
 *
 * @public
 */
export interface PdfSessionSnapshot {
  readonly status: PdfSessionStatus;
  /** The document being edited: its pages, in order, and form values. */
  readonly plan: PdfPlan;
  /** The source documents the session holds. */
  readonly sources: readonly PdfSourceInfo[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Whether a document is being opened or inserted. */
  readonly busy: boolean;
  /** Why the last open or insert failed. Show its text by its code. */
  readonly error: PdfError | undefined;
  /** Limits the open documents are close to. */
  readonly warnings: readonly PdfWarning[];
}

/**
 * Anonymous usage events, for a host's analytics (ADR 0010). They never
 * contain file names, contents, form values or annotation text.
 *
 * @public
 */
export type PdfSessionEvent =
  | { readonly type: "document_opened"; readonly pageCount: number }
  | { readonly type: "document_closed" }
  | { readonly type: "pages_inserted"; readonly pageCount: number }
  | { readonly type: "command"; readonly commands: readonly PdfCommand["type"][] }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "failed"; readonly operation: "open" | "insert"; readonly code: string };

/**
 * Options for {@link createPdfSession}.
 *
 * @public
 */
export interface PdfSessionOptions {
  /** Opens, reads and renders documents, such as `createPdfJsEngine()`. */
  readonly engine: PdfEngine;
  /** Limits for untrusted files (docs/adr/0004). Unknown names throw. */
  readonly filePolicy?: PdfFilePolicyOverrides;
  /** Receives anonymous usage events. Errors it throws are ignored. */
  readonly onEvent?: (event: PdfSessionEvent) => void;
}

/**
 * Options for {@link PdfSession.insert}.
 *
 * @public
 */
export interface PdfInsertOptions extends PdfCallOptions {
  /** The position of the first inserted page. Defaults to the end. */
  readonly at?: number;
  /** Zero-based indexes of the pages to insert. Defaults to every page. */
  readonly pageIndexes?: readonly number[];
}

/**
 * The document being edited, as a framework-agnostic store (ADR 0008): a
 * page plan over the documents opened and inserted, edited with commands,
 * with undo and redo (ADR 0010, docs/adr/0003). React binds to it with
 * `useSyncExternalStore`, and the element binds to the same store.
 *
 * @public
 */
export interface PdfSession {
  /** The current snapshot, the same object until something changes. */
  getSnapshot(): PdfSessionSnapshot;
  /** Calls the listener after every change. Returns a function that unsubscribes. */
  subscribe(listener: () => void): () => void;
  /**
   * Opens a document, replacing the current one and its history once it has
   * opened. The file is checked against the file policy before it's read.
   * Rejects with a `PdfError`, which the snapshot also holds; the current
   * document, if any, stays open.
   */
  open(file: Blob | PdfBytes, options?: PdfCallOptions): Promise<void>;
  /** Inserts the pages of another document, as one undoable step. */
  insert(file: Blob | PdfBytes, options?: PdfInsertOptions): Promise<void>;
  /**
   * Runs one command, or several as one undoable step. Throws `TypeError`
   * or `RangeError` for a command that doesn't fit the plan, and changes
   * nothing then.
   */
  execute(commands: PdfCommand | readonly PdfCommand[]): void;
  undo(): void;
  redo(): void;
  /** A plan page's size, and its rotation as shown: its own plus the plan's. */
  getPage(key: string, options?: PdfCallOptions): Promise<PdfPageInfo>;
  /** Renders a plan page with its rotation. */
  renderPage(
    key: string,
    canvas: HTMLCanvasElement,
    options: Omit<PdfRenderOptions, "rotation">,
  ): Promise<void>;
  /** A plan page's text, positioned on the unrotated page. */
  getTextContent(key: string, options?: PdfCallOptions): Promise<PdfTextContent>;
  /** A plan page's form fields, with the session's values applied. */
  getFormFields(key: string, options?: PdfCallOptions): Promise<readonly PdfFormField[]>;
  /** Closes the document and releases its sources. */
  close(): Promise<void>;
}

interface Source extends PdfSourceInfo {
  readonly bytes: Uint8Array;
  readonly document: PdfDocumentHandle;
}

/**
 * Creates a {@link PdfSession}. Pass the engine to use; the headless core
 * doesn't choose one, so it can't pull pdf.js into applications that don't
 * want it.
 *
 * @example
 * ```ts
 * const session = createPdfSession({ engine: createPdfJsEngine() });
 * await session.open(file);
 * const [first] = session.getSnapshot().plan.pages;
 * session.execute({ type: "pdf.rotatePages", pages: [first.key], angle: 90 });
 * session.undo();
 * ```
 *
 * @public
 */
export function createPdfSession(options: PdfSessionOptions): PdfSession {
  const { engine } = options;
  const policy = pdfLimits.resolve(options.filePolicy);
  const history = new History();
  const listeners = new Set<() => void>();
  const sources = new Map<string, Source>();
  let plan: PdfPlan = EMPTY_PLAN;
  let status: PdfSessionStatus = "empty";
  let error: PdfError | undefined;
  let warnings: PdfWarning[] = [];
  let busy = 0;
  let nextKey = 0;
  let nextSource = 0;
  /** Cancels the load in progress when a newer open replaces it. */
  let loading: AbortController | undefined;
  let snapshot = makeSnapshot();

  function makeSnapshot(): PdfSessionSnapshot {
    return Object.freeze({
      status,
      plan,
      sources: Object.freeze(
        [...sources.values()].map(({ id, pageCount, byteLength }) =>
          Object.freeze({ id, pageCount, byteLength }),
        ),
      ),
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      busy: busy > 0,
      error,
      warnings: Object.freeze([...warnings]),
    });
  }

  function changed(): void {
    snapshot = makeSnapshot();
    for (const listener of [...listeners]) listener();
  }

  function emit(event: PdfSessionEvent): void {
    try {
      options.onEvent?.(event);
    } catch {
      // A host's analytics must never break editing.
    }
  }

  /** Reads, checks and opens one file as a source, without registering it. */
  async function load(file: Blob | PdfBytes, signal: AbortSignal): Promise<Source> {
    const found: PdfWarning[] = [];
    const warnAt = (limit: PdfLimitName, actual: number) => {
      if (policy.check(limit, actual) === "warning") found.push({ limit, actual });
    };
    // The file size, before anything is read (ADR 0020).
    if (file instanceof Blob) {
      if (checkFile(policy, file) === "warning")
        found.push({ limit: "maxFileSize", actual: file.size });
    } else {
      warnAt("maxFileSize", file.byteLength);
    }
    const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : copyBytes(file);
    throwIfAborted(signal);
    const document = await withProcessingTime(
      policy,
      (limited) => engine.open(bytes, { signal: limited }),
      { signal },
    ).catch((reason: unknown) => {
      throw asPdfError(reason, "The PDF couldn't be opened.");
    });
    try {
      throwIfAborted(signal);
      warnAt("maxPages", document.pageCount);
    } catch (reason) {
      await document.destroy();
      throw reason;
    }
    warnings = [...warnings.filter((warning) => warning.limit !== "maxFileSize"), ...found];
    nextSource += 1;
    return {
      id: `s${nextSource}`,
      pageCount: document.pageCount,
      byteLength: bytes.byteLength,
      bytes,
      document,
    };
  }

  /** Runs a load, marking the session busy, and cancelling it if a newer open starts. */
  async function track<Value>(
    signal: AbortSignal | undefined,
    replaces: boolean,
    run: (signal: AbortSignal) => Promise<Value>,
  ): Promise<Value> {
    if (replaces) loading?.abort(new PdfError("ABORTED", "A newer document replaced this one."));
    const controller = new AbortController();
    if (replaces) loading = controller;
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    busy += 1;
    changed();
    try {
      return await run(combined);
    } finally {
      busy -= 1;
      if (loading === controller) loading = undefined;
      changed();
    }
  }

  async function release(): Promise<void> {
    const documents = [...sources.values()].map((source) => source.document);
    sources.clear();
    await Promise.all(documents.map((document) => document.destroy().catch(() => {})));
  }

  function pageFor(key: string): { page: PdfPlanPage; source: Source } {
    const page = plan.pages.find((entry) => entry.key === key);
    const source = page && sources.get(page.source);
    if (!page || !source) throw new TypeError(`The plan has no page ${key}.`);
    return { page, source };
  }

  function step(commands: readonly PdfCommand[]): void {
    const result = applyCommands(plan, commands);
    plan = result.plan;
    history.push({ commands, inverses: result.inverses });
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async open(file, callOptions = {}) {
      status = "opening";
      error = undefined;
      try {
        const source = await track(callOptions.signal, true, (signal) => load(file, signal));
        await release();
        sources.set(source.id, source);
        history.clear();
        plan = {
          pages: Array.from({ length: source.pageCount }, (_, pageIndex) => {
            nextKey += 1;
            return {
              key: `p${nextKey}`,
              source: source.id,
              pageIndex,
              rotation: 0,
              annotations: [],
            };
          }),
          formValues: {},
        };
        status = "ready";
        changed();
        emit({ type: "document_opened", pageCount: source.pageCount });
      } catch (reason) {
        const failure = asPdfError(reason, "The PDF couldn't be opened.");
        // A newer open replaced this one; it reports its own outcome.
        if (failure.code === "ABORTED" && loading !== undefined) throw failure;
        // A failed open keeps the document that was already open, and its
        // history, so a bad file never costs the user their work.
        status = sources.size > 0 ? "ready" : "error";
        error = failure;
        changed();
        emit({ type: "failed", operation: "open", code: failure.code });
        throw failure;
      }
    },

    async insert(file, insertOptions = {}) {
      if (status !== "ready") {
        throw new PdfError("PROCESSING_FAILED", "Open a document before inserting another.");
      }
      error = undefined;
      try {
        const source = await track(insertOptions.signal, false, async (signal) => {
          policy.check("maxFiles", sources.size + 1);
          return load(file, signal);
        });
        try {
          const pageIndexes =
            insertOptions.pageIndexes ??
            Array.from({ length: source.pageCount }, (_, index) => index);
          for (const index of pageIndexes) {
            if (!Number.isInteger(index) || index < 0 || index >= source.pageCount) {
              throw new RangeError(`The inserted document has no page index ${index}.`);
            }
          }
          if (policy.check("maxPages", plan.pages.length + pageIndexes.length) === "warning") {
            warnings = [
              ...warnings.filter((warning) => warning.limit !== "maxPages"),
              { limit: "maxPages", actual: plan.pages.length + pageIndexes.length },
            ];
          }
          const keys = pageIndexes.map(() => {
            nextKey += 1;
            return `p${nextKey}`;
          });
          sources.set(source.id, source);
          step([
            {
              type: "pdf.insertPages",
              source: source.id,
              pageIndexes,
              at: insertOptions.at ?? plan.pages.length,
              keys,
            },
          ]);
          changed();
          emit({ type: "pages_inserted", pageCount: pageIndexes.length });
        } catch (reason) {
          sources.delete(source.id);
          await source.document.destroy().catch(() => {});
          throw reason;
        }
      } catch (reason) {
        if (reason instanceof TypeError || reason instanceof RangeError) throw reason;
        const failure = asPdfError(reason, "The PDF couldn't be inserted.");
        error = failure;
        changed();
        emit({ type: "failed", operation: "insert", code: failure.code });
        throw failure;
      }
    },

    execute(commands) {
      const list = Array.isArray(commands) ? commands : [commands as PdfCommand];
      if (list.length === 0) return;
      step(list);
      changed();
      emit({ type: "command", commands: list.map((command) => command.type) });
    },

    undo() {
      const entry = history.undo();
      if (!entry) return;
      try {
        plan = applyCommands(plan, entry.inverses).plan;
      } catch (reason) {
        history.restore("undo");
        throw reason;
      }
      changed();
      emit({ type: "undo" });
    },

    redo() {
      const entry = history.redo();
      if (!entry) return;
      try {
        plan = applyCommands(plan, entry.commands).plan;
      } catch (reason) {
        history.restore("redo");
        throw reason;
      }
      changed();
      emit({ type: "redo" });
    },

    async getPage(key, callOptions) {
      const { page, source } = pageFor(key);
      const info = await source.document.getPage(page.pageIndex, callOptions);
      return { ...info, rotation: addRotation(info.rotation, page.rotation) };
    },

    async renderPage(key, canvas, renderOptions) {
      const { page, source } = pageFor(key);
      await source.document.renderPage(page.pageIndex, canvas, {
        ...renderOptions,
        rotation: page.rotation,
      });
    },

    async getTextContent(key, callOptions) {
      const { page, source } = pageFor(key);
      return source.document.getTextContent(page.pageIndex, callOptions);
    },

    async getFormFields(key, callOptions) {
      const { page, source } = pageFor(key);
      const fields = await source.document.getFormFields(page.pageIndex, callOptions);
      const values = plan.formValues[source.id] ?? {};
      return fields.map((field) =>
        Object.hasOwn(values, field.name)
          ? { ...field, value: values[field.name] as typeof field.value }
          : field,
      );
    },

    async close() {
      loading?.abort(new PdfError("ABORTED", "The document was closed."));
      const hadDocument = status === "ready";
      await release();
      plan = EMPTY_PLAN;
      history.clear();
      warnings = [];
      error = undefined;
      status = "empty";
      changed();
      if (hadDocument) emit({ type: "document_closed" });
    },
  };
}
