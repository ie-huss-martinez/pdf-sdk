import {
  coreLimits,
  defineLimits,
  type FilePolicy,
  type FilePolicyOverrides,
  type Limits,
} from "@hussmartinez/sdk-core";
import { PdfError } from "./pdf-error.js";

/**
 * The PDF SDK's limit definitions: sdk-core's core limits plus three for PDFs
 * (ADR 0004).
 *
 * | Limit | Code | Default maximum | Default warning |
 * |---|---|---|---|
 * | `maxFileSize` | `FILE_TOO_LARGE` | 100 MB | 50 MB |
 * | `maxFiles` | `TOO_MANY_FILES` | 20 | none |
 * | `maxDecodedSize` | `DECODED_SIZE_TOO_LARGE` | 500 MB | none |
 * | `maxProcessingTime` | `PROCESSING_TIME_EXCEEDED` | 120 s | none |
 * | `maxPages` | `TOO_MANY_PAGES` | 5,000 | 1,000 |
 * | `maxSessionSize` | `SESSION_TOO_LARGE` | 300 MB | 150 MB |
 * | `maxImagePixels` | `IMAGE_TOO_LARGE` | 100 megapixels | none |
 *
 * Sizes are decimal: 1 MB is 1,000,000 bytes.
 *
 * @public
 */
export const pdfLimitDefinitions = {
  ...coreLimits,
  maxPages: { code: "TOO_MANY_PAGES", unit: "count", default: 5_000, warning: 1_000 },
  maxSessionSize: {
    code: "SESSION_TOO_LARGE",
    unit: "bytes",
    default: 300_000_000,
    warning: 150_000_000,
  },
  maxImagePixels: { code: "IMAGE_TOO_LARGE", unit: "pixels", default: 100_000_000 },
} as const;

/**
 * The type of {@link pdfLimitDefinitions}.
 *
 * @public
 */
export type PdfLimitDefinitions = typeof pdfLimitDefinitions;

/**
 * The names of the PDF SDK's limits.
 *
 * @public
 */
export type PdfLimitName = keyof PdfLimitDefinitions;

/**
 * A host's `filePolicy`: a new maximum, or `{ maximum, warning }`, for any of
 * the PDF SDK's limits. `Infinity` disables a maximum, which removes a
 * protection against hostile files, or disables a warning. Unknown limit
 * names throw `TypeError` when the policy is resolved.
 *
 * @example
 * ```ts
 * const filePolicy: PdfFilePolicyOverrides = {
 *   maxFileSize: { maximum: 300e6, warning: 100e6 },
 *   maxSessionSize: 600e6,
 * };
 * ```
 *
 * @public
 */
export type PdfFilePolicyOverrides = FilePolicyOverrides<PdfLimitDefinitions>;

/**
 * A resolved file policy for the PDF SDK. Violations throw {@link PdfError}.
 *
 * @public
 */
export type PdfFilePolicy = FilePolicy<PdfLimitDefinitions>;

/**
 * The PDF SDK's limits, ready to resolve a host's `filePolicy`. Violations
 * are thrown as {@link PdfError}, with `details` naming the limit.
 *
 * @example
 * ```ts
 * const policy = pdfLimits.resolve(props.filePolicy);
 * policy.check("maxPages", pageCount); // throws PdfError("TOO_MANY_PAGES") above 5,000
 * ```
 *
 * @public
 */
export const pdfLimits: Limits<PdfLimitDefinitions> = /* @__PURE__ */ defineLimits(
  pdfLimitDefinitions,
  {
    errorClass: PdfError,
  },
);
