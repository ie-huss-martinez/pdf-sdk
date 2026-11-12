import type { Messages } from "@hussmartinez/sdk-core";
import { createContext } from "react";
import type { PdfSession } from "../core/session/session.js";
import type { PdfMessageCatalogue } from "../messages/en.js";

/** What the provider shares with every PDF component below it. */
export interface PdfContextValue {
  readonly session: PdfSession;
  readonly messages: Messages<PdfMessageCatalogue>;
}

export const PdfContext = /* @__PURE__ */ createContext<PdfContextValue | undefined>(undefined);
