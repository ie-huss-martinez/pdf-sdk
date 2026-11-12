import { createHash } from "node:crypto";
import base64 from "virtual:hm-qpdf-wasm";
import { describe, expect, it } from "vitest";
import { QPDF_WASM_SHA256, readQpdfWasm } from "../tools/qpdf-wasm-plugin.js";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("qpdf.wasm (docs/adr/0001)", () => {
  it("is the reviewed binary", () => {
    // If pdfstudio was upgraded on purpose, review the new binary, then
    // update QPDF_WASM_SHA256 in tools/qpdf-wasm-plugin.ts.
    expect(sha256(readQpdfWasm())).toBe(QPDF_WASM_SHA256);
  });

  it("is what the processing worker inlines, byte for byte", () => {
    expect(sha256(Buffer.from(base64, "base64"))).toBe(QPDF_WASM_SHA256);
  });
});
