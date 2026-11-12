import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInlineDataFactory, type PdfJsDataKind } from "./binary-data.js";

const pdfJs = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const factory = new (createInlineDataFactory())();

describe("the inline data factory", () => {
  it.each([
    ["cMapUrl", "UniJIS-UCS2-H.bcmap", "cmaps"],
    ["standardFontDataUrl", "FoxitSerif.pfb", "standard_fonts"],
    ["wasmUrl", "jbig2.wasm", "wasm"],
    ["wasmUrl", "openjpeg.wasm", "wasm"],
  ] as const)("serves %s %s, byte for byte", async (kind, filename, directory) => {
    const expected = await readFile(join(pdfJs, directory, filename));
    const served = await factory.fetch({ kind, filename });
    expect(Buffer.from(served).equals(expected)).toBe(true);
  });

  it.each([
    ["wasmUrl", "jbig2_nowasm_fallback.js", "a JavaScript decoder fallback"],
    ["wasmUrl", "quickjs-eval.wasm", "the scripting sandbox"],
    ["wasmUrl", "qcms_bg.wasm", "the ICC decoder, which only self-hosted mode loads"],
    ["standardFontDataUrl", "LiberationSans-Regular.ttf", "a GPL-licensed font"],
    ["cMapUrl", "../package.json", "a path"],
    ["cMapUrl", "UniJIS-UCS2-H", "a name without its extension"],
    ["cMapUrl", "__proto__", "a prototype key"],
    ["cMapUrl", "constructor", "a prototype key"],
    ["iccUrl", "CGATS001Compat-v2-micro.icc", "an unknown kind"],
  ])("refuses %s %s, %s", async (kind, filename) => {
    await expect(factory.fetch({ kind: kind as PdfJsDataKind, filename })).rejects.toThrow(
      /doesn't serve/,
    );
  });
});
