import type { Announce } from "@hussmartinez/ui/react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { isPdfError } from "../../core/errors/pdf-error.js";
import type { PdfSession } from "../../core/session/session.js";
import { downloadFileName, saveFile } from "../../features/save/download-name.js";
import type { usePdfMessages } from "../hooks.js";
import type { PdfDownloadNameInfo, PdfEditorProps } from "./types.js";

/** How long a save runs before its Cancel button appears, in milliseconds. */
export const CANCEL_AFTER = 1_000;

/** Where a save is, for the editor's header and its tools. */
export interface SaveState {
  readonly saving: boolean;
  /** Whether the Cancel button shows: only once a save takes a while. */
  readonly cancellable: boolean;
  /** The text of the last save's failure, for the header's alert. */
  readonly failure: string | undefined;
}

const IDLE: SaveState = { saving: false, cancellable: false, failure: undefined };

/**
 * The download tool's work (docs/adr/0009): builds the document in the
 * worker, then saves it through the browser or hands it to `onExport`.
 * One save runs at a time. Cancel, or opening or closing a document,
 * aborts it quietly; a failure is described by its code, or by the
 * catalogue's save failure when the host's own code fails.
 */
export function useSave(options: {
  readonly session: PdfSession;
  readonly messages: ReturnType<typeof usePdfMessages>;
  readonly announce: Announce;
  readonly props: RefObject<Pick<PdfEditorProps, "onExport" | "downloadName">>;
}): SaveState & { readonly save: () => void; readonly cancel: () => void } {
  const { session, messages, announce, props } = options;
  const [state, setState] = useState<SaveState>(IDLE);
  const running = useRef<AbortController | undefined>(undefined);

  const cancel = useCallback(() => running.current?.abort(), []);

  const save = useCallback(() => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setState({ saving: true, cancellable: false, failure: undefined });
    const timer = setTimeout(
      () => setState((current) => (current.saving ? { ...current, cancellable: true } : current)),
      CANCEL_AFTER,
    );
    let failure: string | undefined;
    const finish = () => {
      clearTimeout(timer);
      if (running.current === controller) running.current = undefined;
      setState({ saving: false, cancellable: false, failure });
    };
    void (async () => {
      const snapshot = session.getSnapshot();
      const info: PdfDownloadNameInfo = {
        pageCount: snapshot.plan.pages.length,
        ...(snapshot.sources[0]?.name ? { sourceName: snapshot.sources[0].name } : {}),
      };
      let bytes: Uint8Array;
      try {
        bytes = await session.export({ signal: controller.signal });
      } catch (error) {
        if (!controller.signal.aborted && !isPdfError(error, "ABORTED")) {
          failure = messages.error(error);
        }
        return;
      }
      if (controller.signal.aborted) return;
      const { onExport, downloadName } = props.current;
      try {
        const name = downloadFileName(downloadName ? downloadName(info) : info.sourceName);
        if (onExport) {
          await onExport(bytes, { fileName: name, pageCount: info.pageCount });
          announce(messages.t("editor.ready"));
        } else {
          saveFile(bytes, name);
          announce(messages.t("editor.saved", { name }));
        }
      } catch {
        // The host's code failed; its error is its own to log (docs/adr/0009).
        failure = messages.t("editor.saveFailed");
      }
    })().finally(finish);
  }, [session, messages, announce, props]);

  // Opening or closing a document cancels a save, and the last failure no
  // longer applies; so does leaving the page.
  const opened = session.getSnapshot().sources[0]?.id;
  useEffect(() => {
    void opened;
    running.current?.abort();
    setState((current) => (current.failure ? { ...current, failure: undefined } : current));
  }, [opened]);
  useEffect(() => () => running.current?.abort(), []);

  return { ...state, save, cancel };
}
