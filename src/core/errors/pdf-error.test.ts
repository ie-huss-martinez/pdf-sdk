import { deserializeError, isSdkError, SdkError, serializeError } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { isPdfError, PdfError } from "./pdf-error.js";

describe("PdfError", () => {
  it("carries a code, details and cause, as an SdkError", () => {
    const cause = new Error("pdf.js: Invalid PDF structure.");
    const error = new PdfError("INVALID_PDF", "The file couldn't be parsed.", {
      details: { reason: "missing header" },
      cause,
    });
    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({
      name: "PdfError",
      code: "INVALID_PDF",
      details: { reason: "missing header" },
      cause,
    });
    expect(isSdkError(error, "INVALID_PDF")).toBe(true);
  });

  it("keeps its class, code and details across a worker boundary", () => {
    const original = new PdfError("TOO_MANY_PAGES", "Too many pages.", {
      details: { limit: "maxPages", maximum: 5_000, actual: 6_200, unit: "count" },
    });
    // What a worker posts, cloned as postMessage would.
    const received = structuredClone(serializeError(original));
    const rebuilt = deserializeError(received, { errorClasses: { PdfError } });
    expect(rebuilt).toBeInstanceOf(PdfError);
    expect(isPdfError(rebuilt, "TOO_MANY_PAGES")).toBe(true);
    expect(rebuilt.details).toEqual(original.details);
  });
});

describe("isPdfError", () => {
  it("recognises a PdfError, and checks its code when given one", () => {
    const error = new PdfError("PASSWORD_REQUIRED", "Encrypted.");
    expect(isPdfError(error)).toBe(true);
    expect(isPdfError(error, "PASSWORD_REQUIRED")).toBe(true);
    expect(isPdfError(error, "INVALID_PDF")).toBe(false);
  });

  it("rejects other SDK errors and plain values", () => {
    expect(isPdfError(new SdkError("ABORTED", "Stopped."))).toBe(false);
    expect(isPdfError(new Error("INVALID_PDF"))).toBe(false);
    expect(isPdfError({ name: "PdfError", code: "INVALID_PDF", message: "forged" })).toBe(false);
    expect(isPdfError(undefined)).toBe(false);
  });
});
