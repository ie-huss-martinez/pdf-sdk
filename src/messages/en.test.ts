import { createMessages } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { PdfError, type PdfErrorCode } from "../core/errors/pdf-error.js";
import { pdfLimitDefinitions, pdfLimits } from "../core/errors/pdf-limits.js";
import { pdfMessages } from "./en.js";

// Listing every code here makes the type checker fail when a code is added
// to PdfErrorCode without being listed, and the test fail when its text is
// missing from the catalogue.
const ALL_CODES: Record<PdfErrorCode, true> = {
  UNKNOWN: true,
  ABORTED: true,
  TIMEOUT: true,
  WORKER_START_FAILED: true,
  WORKER_PROTOCOL_MISMATCH: true,
  WORKER_CRASHED: true,
  WORKER_TERMINATED: true,
  WORKER_METHOD_NOT_FOUND: true,
  WORKER_DATA_NOT_CLONEABLE: true,
  UNSUPPORTED_ENVIRONMENT: true,
  FILE_TOO_LARGE: true,
  TOO_MANY_FILES: true,
  DECODED_SIZE_TOO_LARGE: true,
  PROCESSING_TIME_EXCEEDED: true,
  INVALID_PDF: true,
  PASSWORD_REQUIRED: true,
  PROCESSING_FAILED: true,
  TOO_MANY_PAGES: true,
  SESSION_TOO_LARGE: true,
  IMAGE_TOO_LARGE: true,
};

describe("pdfMessages", () => {
  it("has text for every PdfError code and every limit's warning", () => {
    for (const code of Object.keys(ALL_CODES)) {
      expect(pdfMessages, code).toHaveProperty(`errors.${code}`);
    }
    for (const limit of Object.keys(pdfLimitDefinitions)) {
      expect(pdfMessages, limit).toHaveProperty(`warnings.${limit}`);
    }
  });

  it("is a valid catalogue", () => {
    // createMessages throws on a malformed message in the SDK's own catalogue.
    expect(() => createMessages(pdfMessages)).not.toThrow();
  });

  it("describes a limit violation with its details, never its message", () => {
    const messages = createMessages(pdfMessages);
    let thrown: unknown;
    try {
      pdfLimits.resolve().check("maxPages", 6_200);
    } catch (error) {
      thrown = error;
    }
    expect(messages.error(thrown)).toBe(
      "This document has 6,200 pages, which is over the 5,000-page limit.",
    );
    expect(messages.error(new PdfError("INVALID_PDF", "<script>from the file</script>"))).toBe(
      "This file isn't a PDF, or it's too damaged to open.",
    );
  });

  it("formats sizes and plurals for the locale", () => {
    const en = createMessages(pdfMessages);
    expect(en.t("warnings.maxPages", { actual: 1 })).toBe(
      "This document has 1 page. Large documents may be slow.",
    );
    expect(en.t("warnings.maxSessionSize", { actual: 180_000_000 })).toBe(
      "The open documents use 180 MB. Clearing the undo history frees memory.",
    );
    const de = createMessages(pdfMessages, { locale: "de" });
    expect(de.t("warnings.maxPages", { actual: 1_200 })).toBe(
      "This document has 1.200 pages. Large documents may be slow.",
    );
  });
});
