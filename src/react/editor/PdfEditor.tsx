import type { Messages } from "@hussmartinez/sdk-core";
import {
  type ForwardedRef,
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PdfLimitName } from "../../core/errors/pdf-limits.js";
import type { PdfSessionSnapshot, PdfWarning } from "../../core/session/session.js";
import type { PdfMessageCatalogue } from "../../messages/en.js";
import { usePdfDocument, usePdfMessages, usePdfSession } from "../hooks.js";
import { PdfSessionProvider } from "../PdfSessionProvider.js";
import { PdfThumbnails } from "../thumbnails/PdfThumbnails.js";
import { PdfViewer } from "../viewer/PdfViewer.js";
import { PdfEditorStart } from "./PdfEditorStart.js";
import type { PdfEditorChange, PdfEditorHandle, PdfEditorProps } from "./types.js";

/**
 * A warning's text. Each one is passed `actual`; texts that don't show it
 * ignore it, which the catalogue's per-key types can't express for a union.
 */
function warningText(messages: Messages<PdfMessageCatalogue>, warning: PdfWarning): string {
  const t = messages.t as (key: `warnings.${PdfLimitName}`, params: { actual: number }) => string;
  return t(`warnings.${warning.limit}`, { actual: warning.actual });
}

const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

/** What changed between two snapshots, if the host should hear about it. */
function changeBetween(
  before: PdfSessionSnapshot,
  after: PdfSessionSnapshot,
): PdfEditorChange | undefined {
  const pageCount = after.plan.pages.length;
  if (after.status === "ready" && after.sources[0]?.id !== before.sources[0]?.id) {
    return { reason: "open", pageCount };
  }
  if (before.sources.length > 0 && after.sources.length === 0) {
    return { reason: "close", pageCount: 0 };
  }
  if (after.status === "ready" && after.plan !== before.plan) {
    return { reason: "edit", pageCount };
  }
  return undefined;
}

interface BodyProps
  extends Pick<PdfEditorProps, "file" | "onChange" | "className" | "classNames" | "unstyled"> {
  readonly handle: ForwardedRef<PdfEditorHandle>;
}

function PdfEditorBody(props: BodyProps): ReactNode {
  const { file, onChange, className, classNames = {}, unstyled = false, handle } = props;
  const session = usePdfSession();
  const snapshot = usePdfDocument();
  const messages = usePdfMessages();
  const root = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  useImperativeHandle(
    handle,
    () => ({
      session,
      open: (next) => session.open(next),
      export: (options) => session.export(options),
      undo: () => session.undo(),
      redo: () => session.redo(),
      close: () => session.close(),
    }),
    [session],
  );

  // The host's file opens when its identity changes; a newer one cancels it.
  useEffect(() => {
    if (file === undefined) return;
    if (file === null) {
      void session.close();
      return;
    }
    const controller = new AbortController();
    // A failure is in the snapshot, which the editor shows.
    session.open(file, { signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [session, file]);

  // Changes reach the host, and opening and closing reach screen readers.
  useEffect(() => {
    let before = session.getSnapshot();
    return session.subscribe(() => {
      const after = session.getSnapshot();
      const change = changeBetween(before, after);
      before = after;
      if (!change) return;
      if (change.reason === "open") {
        setAnnouncement(messages.t("editor.opened", { count: change.pageCount }));
      } else if (change.reason === "close") {
        setAnnouncement(messages.t("editor.closed"));
      }
      latestOnChange.current?.(change);
    });
  }, [session, messages]);

  // Focus follows the content that replaced what had it: the document once
  // it opens, or the button to try again after a failure. Focus elsewhere on
  // the host's page is left alone.
  const { status } = snapshot;
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    const active = document.activeElement;
    const ours = active === null || active === document.body || root.current?.contains(active);
    if (!ours) return;
    if (status === "ready") root.current?.querySelector<HTMLElement>(".hm-pdf-viewer")?.focus();
    if (status === "error") startButton.current?.focus();
  }, [status]);

  const open = (chosen: File) => {
    // A failure is in the snapshot, which the editor shows.
    session.open(chosen).catch(() => {});
  };

  const { error, warnings } = snapshot;
  const showError = error !== undefined && error.code !== "ABORTED";
  let content: ReactNode;
  if (status === "ready") {
    content = (
      <>
        <PdfThumbnails
          className={join("hm-pdf-editor-sidebar", classNames.sidebar)}
          unstyled={unstyled}
        />
        <PdfViewer unstyled={unstyled} />
      </>
    );
  } else if (status === "opening") {
    content = (
      <div role="status" className={join("hm-pdf-editor-loading", classNames.status)}>
        {/* Indeterminate: the engine reports no progress while it opens. */}
        <progress className="hm-pdf-editor-progress" aria-hidden="true" />
        <p>{messages.t("editor.opening")}</p>
      </div>
    );
  } else {
    content = (
      <PdfEditorStart
        error={showError ? error : undefined}
        onFile={open}
        button={startButton}
        className={join("hm-pdf-editor-start", classNames.start)}
        alertClassName={join("hm-pdf-editor-alert", classNames.alert)}
      />
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of the editor's regions, not a fieldset
    <div
      ref={root}
      role="group"
      aria-label={messages.t("editor.label")}
      aria-busy={status === "opening" || snapshot.busy}
      className={join("hm-pdf-editor", className, classNames.root)}
      data-hm-status={status}
      {...(unstyled ? { "data-hm-unstyled": "" } : {})}
    >
      <div className={join("hm-pdf-editor-header", classNames.header)}>
        {/* The toolbar's place; the toolbar arrives in a later release. */}
        <div className={join("hm-pdf-editor-toolbar", classNames.toolbar)} />
        {status === "ready" && showError ? (
          <p role="alert" className={join("hm-pdf-editor-alert", classNames.alert)}>
            {messages.error(error)}
          </p>
        ) : null}
        {status === "ready" && warnings.length > 0 ? (
          <div role="status" className={join("hm-pdf-editor-warnings", classNames.status)}>
            <ul>
              {warnings.map((warning) => (
                <li key={warning.limit}>{warningText(messages, warning)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className={join("hm-pdf-editor-body", classNames.body)}>{content}</div>
      <p role="status" className="hm-pdf-editor-announcer">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The complete editor: a document's pages beside it as thumbnails, with
 * designed states for no document, opening and a failed open (ADR 0014).
 * It creates its own session, through `PdfSessionProvider`, unless one is
 * passed, and releases what it created when it unmounts.
 *
 * Users open a PDF with the button, which keyboard and screen reader users
 * reach like any other, or by dropping it on the editor. Opening and
 * closing are announced, and focus moves to the document once it opens, or
 * to the button to try again if it couldn't.
 *
 * Give the editor a bounded height, such as a grid row or a fixed height:
 * its viewer and thumbnails scroll within it.
 *
 * @example
 * ```tsx
 * const editor = useRef<PdfEditorHandle>(null);
 * <PdfEditor ref={editor} file={file} onChange={({ reason }) => setDirty(reason === "edit")} />;
 * const bytes = await editor.current?.export();
 * ```
 *
 * @public
 */
export const PdfEditor = /* @__PURE__ */ forwardRef(function PdfEditor(
  props: PdfEditorProps,
  handle: ForwardedRef<PdfEditorHandle>,
): ReactNode {
  const { file, onChange, className, classNames, unstyled, ...provider } = props;
  return (
    <PdfSessionProvider {...provider}>
      <PdfEditorBody
        handle={handle}
        {...(file !== undefined ? { file } : {})}
        {...(onChange ? { onChange } : {})}
        {...(className !== undefined ? { className } : {})}
        {...(classNames ? { classNames } : {})}
        {...(unstyled !== undefined ? { unstyled } : {})}
      />
    </PdfSessionProvider>
  );
});
