import { defineMessages } from "@hussmartinez/sdk-core";
import { uiMessages } from "@hussmartinez/ui";
import { pdfMessages } from "../messages/en.js";

/**
 * The editor's English message catalogue: the SDK's own, which includes
 * sdk-core's, and `@hussmartinez/ui`'s, for the ui components the editor
 * renders (sdk-core ADR 0046). The editor builds one `Messages` object from
 * it, with the host's locale and overrides, and gives the same object to
 * its own components and to ui's.
 *
 * It's defined in the React entry, so the headless `.` entry and its
 * `pdfMessages` don't carry ui's text.
 *
 * @public
 */
export const pdfEditorMessages = /* @__PURE__ */ defineMessages({ ...pdfMessages, ...uiMessages });

/**
 * The type of {@link pdfEditorMessages}, for typing the editor's `messages`
 * overrides with `MessageOverrides<PdfEditorMessageCatalogue>`.
 *
 * @public
 */
export type PdfEditorMessageCatalogue = typeof pdfEditorMessages;
