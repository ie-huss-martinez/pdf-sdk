import { checkFile, coreLimits } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { isPdfError } from "./pdf-error.js";
import { pdfLimitDefinitions, pdfLimits } from "./pdf-limits.js";

describe("pdfLimits", () => {
  it("keeps the core limits and their defaults", () => {
    for (const [name, definition] of Object.entries(coreLimits)) {
      expect(pdfLimitDefinitions).toHaveProperty(name, definition);
    }
  });

  it("has the PDF defaults of ADR 0004", () => {
    expect(pdfLimits.resolve().limits).toMatchObject({
      maxPages: { maximum: 5_000, warning: 1_000 },
      maxSessionSize: { maximum: 300_000_000, warning: 150_000_000 },
      maxImagePixels: { maximum: 100_000_000, warning: Number.POSITIVE_INFINITY },
    });
  });

  it("throws a PdfError naming the limit, and warns from the threshold", () => {
    const policy = pdfLimits.resolve();
    expect(policy.check("maxPages", 999)).toBeUndefined();
    expect(policy.check("maxPages", 1_000)).toBe("warning");
    expect(policy.check("maxPages", 5_000)).toBe("warning");

    let thrown: unknown;
    try {
      policy.check("maxPages", 5_001);
    } catch (error) {
      thrown = error;
    }
    expect(isPdfError(thrown, "TOO_MANY_PAGES")).toBe(true);
    expect((thrown as { details?: unknown }).details).toEqual({
      limit: "maxPages",
      maximum: 5_000,
      actual: 5_001,
      unit: "count",
    });
  });

  it("throws core limit violations as PdfError too", () => {
    const policy = pdfLimits.resolve({ maxFileSize: 10 });
    const file = new Blob([new Uint8Array(11)]);
    expect(() => checkFile(policy, file)).toThrow(
      expect.objectContaining({ name: "PdfError", code: "FILE_TOO_LARGE" }),
    );
  });

  it("applies a host's settings, and rejects unknown names and invalid values", () => {
    const policy = pdfLimits.resolve({
      maxFileSize: { maximum: 300e6, warning: 100e6 },
      maxSessionSize: 600e6,
    });
    expect(policy.limits.maxFileSize).toEqual({ maximum: 300e6, warning: 100e6 });
    expect(policy.limits.maxSessionSize.maximum).toBe(600e6);

    // A typo must not silently leave the default in place (ADR 0020).
    expect(() => pdfLimits.resolve({ maxPage: 10 } as never)).toThrow(TypeError);
    expect(() => pdfLimits.resolve({ maxPages: 0 })).toThrow(RangeError);
    expect(() => pdfLimits.resolve({ maxPages: { maximum: 10, warn: 5 } as never })).toThrow(
      TypeError,
    );
  });
});
