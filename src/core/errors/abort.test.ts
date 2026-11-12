import { SdkError } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { abortError, asPdfError, throwIfAborted } from "./abort.js";
import { PdfError } from "./pdf-error.js";

function aborted(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe("abortError", () => {
  it("is ABORTED for a plain abort, with the reason as cause", () => {
    const signal = aborted();
    expect(abortError(signal)).toMatchObject({ name: "PdfError", code: "ABORTED" });
    expect(abortError(signal).cause).toBe(signal.reason);
  });

  it("is TIMEOUT for a timeout", () => {
    const reason = new DOMException("Timed out", "TimeoutError");
    expect(abortError(aborted(reason))).toMatchObject({ code: "TIMEOUT", cause: reason });
  });

  it("keeps an SdkError reason's code and details, such as a time limit's", () => {
    const limit = new SdkError("PROCESSING_TIME_EXCEEDED", "Too slow.", {
      details: {
        limit: "maxProcessingTime",
        maximum: 120_000,
        actual: 120_001,
        unit: "milliseconds",
      },
    });
    const error = abortError(aborted(limit));
    expect(error).toBeInstanceOf(PdfError);
    expect(error).toMatchObject({ code: "PROCESSING_TIME_EXCEEDED", details: limit.details });
  });

  it("returns a PdfError reason unchanged", () => {
    const reason = new PdfError("TOO_MANY_PAGES", "Too many.");
    expect(abortError(aborted(reason))).toBe(reason);
  });
});

describe("throwIfAborted", () => {
  it("throws only for an aborted signal", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
    expect(() => throwIfAborted(aborted())).toThrow(expect.objectContaining({ code: "ABORTED" }));
  });
});

describe("asPdfError", () => {
  it("keeps a PdfError, and converts another SdkError with its code and details", () => {
    const pdfError = new PdfError("INVALID_PDF", "Bad.");
    expect(asPdfError(pdfError)).toBe(pdfError);
    const crashed = new SdkError("WORKER_CRASHED", "The worker failed.", {
      details: { method: "build" },
    });
    expect(asPdfError(crashed)).toMatchObject({
      name: "PdfError",
      code: "WORKER_CRASHED",
      details: { method: "build" },
      cause: crashed,
    });
  });

  it("makes anything else PROCESSING_FAILED", () => {
    expect(asPdfError(new Error("boom"), "It failed.")).toMatchObject({
      code: "PROCESSING_FAILED",
      message: "It failed.",
    });
  });
});
