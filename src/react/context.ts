import type { Messages } from "@hussmartinez/sdk-core";
import { createContext } from "react";
import type { PdfSession } from "../core/session/session.js";
import type { PdfEditorMessageCatalogue } from "./editor-messages.js";

/** What the provider shares with every PDF component below it. */
export interface PdfContextValue {
  readonly session: PdfSession;
  readonly messages: Messages<PdfEditorMessageCatalogue>;
}

export const PdfContext = /* @__PURE__ */ createContext<PdfContextValue | undefined>(undefined);
