import { describe, expect, it } from "vitest";
import { PdfError } from "../../core/errors/pdf-error.js";
import { fromPdfJsError } from "./errors.js";

/** pdf.js's exceptions arrive from its worker as plain objects with a name. */
const exception = (name: string) => Object.assign(new Error("from pdf.js"), { name });

describe("fromPdfJsError", () => {
  it.each([
    ["PasswordException", "PASSWORD_REQUIRED"],
    ["InvalidPDFException", "INVALID_PDF"],
    ["FormatError", "INVALID_PDF"],
    ["MissingPDFException", "INVALID_PDF"],
    ["UnknownErrorException", "PROCESSING_FAILED"],
  ])("maps %s to %s, keeping it as cause", (name, code) => {
    const reason = exception(name);
    const error = fromPdfJsError(reason, "It failed.");
    expect(error).toMatchObject({ name: "PdfError", code, cause: reason });
  });

  it("maps anything else to PROCESSING_FAILED with the given message", () => {
    expect(fromPdfJsError("a string", "Rendering failed.")).toMatchObject({
      code: "PROCESSING_FAILED",
      message: "Rendering failed.",
    });
  });

  it("passes PdfError and RangeError through unchanged", () => {
    const pdfError = new PdfError("ABORTED", "Stopped.");
    const rangeError = new RangeError("Bad index.");
    expect(fromPdfJsError(pdfError, "x")).toBe(pdfError);
    expect(fromPdfJsError(rangeError, "x")).toBe(rangeError);
  });
});
