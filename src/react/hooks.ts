import type { Messages } from "@hussmartinez/sdk-core";
import { useContext, useSyncExternalStore } from "react";
import type { PdfSession, PdfSessionSnapshot } from "../core/session/session.js";
import type { PdfMessageCatalogue } from "../messages/en.js";
import { PdfContext, type PdfContextValue } from "./context.js";

function usePdfContext(hook: string): PdfContextValue {
  const value = useContext(PdfContext);
  if (!value) {
    throw new Error(`${hook} must be used inside a PdfSessionProvider.`);
  }
  return value;
}

/**
 * The session of the nearest `PdfSessionProvider`, to open documents, run
 * commands, undo and export.
 *
 * @public
 */
export function usePdfSession(): PdfSession {
  return usePdfContext("usePdfSession").session;
}

/**
 * The session's current snapshot, re-rendering whenever it changes, through
 * `useSyncExternalStore`, so it's safe with concurrent rendering and server
 * rendering (ADR 0008).
 *
 * @public
 */
export function usePdfDocument(): PdfSessionSnapshot {
  const { session } = usePdfContext("usePdfDocument");
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/**
 * The SDK's text for the provider's locale and overrides (ADR 0019).
 *
 * @public
 */
export function usePdfMessages(): Messages<PdfMessageCatalogue> {
  return usePdfContext("usePdfMessages").messages;
}
