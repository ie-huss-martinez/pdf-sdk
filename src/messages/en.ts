import { defineMessages, type MessageValue, plural, sdkCoreMessages } from "@hussmartinez/sdk-core";
import type { PdfErrorCode } from "../core/errors/pdf-error.js";
import type { PdfLimitName } from "../core/errors/pdf-limits.js";

/**
 * The PDF SDK's English message catalogue: sdk-core's messages, and text for
 * every {@link PdfErrorCode} and every limit's warning. Pass it to
 * `createMessages` from `@hussmartinez/sdk-core`, with the host's locale and
 * overrides. The editor's text joins it as the editor arrives.
 *
 * Error text is looked up by code, with the error's `details` as
 * parameters, and never taken from `error.message` (ADR 0019).
 *
 * @example
 * ```ts
 * const messages = createMessages(pdfMessages, { locale: "en", overrides: props.messages });
 * messages.error(error); // "This document has 6,200 pages, which is over the 5,000-page limit."
 * messages.t("warnings.maxPages", { actual: 1_200 });
 * ```
 *
 * @public
 */
export const pdfMessages = /* @__PURE__ */ defineMessages({
  ...sdkCoreMessages,
  "errors.INVALID_PDF": "This file isn't a PDF, or it's too damaged to open.",
  "errors.PASSWORD_REQUIRED": "This PDF is protected with a password.",
  "errors.PROCESSING_FAILED": "Something went wrong while processing this PDF. Please try again.",
  "errors.TOO_MANY_PAGES":
    "This document has {actual, number} pages, which is over the {maximum, number}-page limit.",
  "errors.SESSION_TOO_LARGE":
    "The open documents would use {actual, fileSize}, which is over the {maximum, fileSize} limit. Close a document, or clear the undo history, and try again.",
  "errors.IMAGE_TOO_LARGE":
    "Some images are too large to show. They're kept unchanged in the document.",
  "warnings.maxPages": /* @__PURE__ */ plural("actual", {
    one: "This document has {actual} page. Large documents may be slow.",
    other: "This document has {actual} pages. Large documents may be slow.",
  }),
  "warnings.maxSessionSize":
    "The open documents use {actual, fileSize}. Clearing the undo history frees memory.",
  "warnings.maxImagePixels": "Some images are very large and may be slow to show.",
  "viewer.label": "Document",
  "viewer.empty": "No document is open.",
  "viewer.page": "Page {page} of {count}",
  "viewer.webLink": "Link to {destination}, opens in a new tab",
  "viewer.emailLink": "Email {destination}",
}) satisfies Record<`errors.${PdfErrorCode}`, MessageValue> &
  Record<`warnings.${PdfLimitName}`, MessageValue>;

/**
 * The type of {@link pdfMessages}, for typing a host's overrides with
 * `MessageOverrides<PdfMessageCatalogue>`.
 *
 * @public
 */
export type PdfMessageCatalogue = typeof pdfMessages;
