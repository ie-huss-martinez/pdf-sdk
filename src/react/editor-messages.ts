import { defineMessages } from "@hussmartinez/sdk-core";
import { uiMessages } from "@hussmartinez/ui";
import { pdfEditorText } from "../messages/editor-en.js";
import { pdfMessages } from "../messages/en.js";

/**
 * The English message catalogue of the SDK's components: `pdfMessages`,
 * with sdk-core's text, errors and warnings; `@hussmartinez/ui`'s, for the
 * ui components the editor renders (sdk-core ADR 0046); and the text of the
 * editor, its toolbar and tools, the viewer and the thumbnails.
 *
 * `PdfEditor` and `PdfSessionProvider` each build one `Messages` object from
 * it, with the host's locale and overrides, and the editor gives the same
 * object to its own components and to ui's. Override any of its keys through
 * their `messages` prop, typed with `PdfEditorMessageCatalogue`.
 *
 * It's defined in the React entry, so the server-safe `.` entry and its
 * `pdfMessages` carry no interface text (docs/adr/0010).
 *
 * @public
 */
export const pdfEditorMessages = /* @__PURE__ */ defineMessages({
  ...pdfMessages,
  ...uiMessages,
  ...pdfEditorText,
});

/**
 * The type of {@link pdfEditorMessages}, for typing the editor's `messages`
 * overrides with `MessageOverrides<PdfEditorMessageCatalogue>`.
 *
 * @public
 */
export type PdfEditorMessageCatalogue = typeof pdfEditorMessages;
