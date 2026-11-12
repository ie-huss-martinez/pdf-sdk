import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/**
 * The SHA-256 of the `qpdf.wasm` that `pdfstudio` ships, at the pinned
 * version. pdfstudio is a young package with one maintainer and a prebuilt
 * binary, so any change to the binary must be a reviewed change to this
 * line (docs/adr/0001). The build fails, and so does a unit test, if the
 * installed file differs.
 */
export const QPDF_WASM_SHA256 = "48a6044e2b5abb32295fa1682e26f20338181bb2423b2ab6e8456b7c4a8c9756";

export function readQpdfWasm(): Buffer {
  const require = createRequire(import.meta.url);
  return readFileSync(require.resolve("pdfstudio/qpdf.wasm"));
}

const ID = "virtual:hm-qpdf-wasm";

/**
 * Inlines `qpdf.wasm` into the processing worker as base64, after checking
 * its hash, so the worker compiles it from its own bytes and never fetches it
 * (docs/adr/0001, docs/adr/0002).
 */
/**
 * pdfstudio and qpdf's Emscripten glue can each locate `qpdf.wasm` with
 * `new URL(…, import.meta.url)`. The SDK passes the compiled module instead,
 * so neither path runs, but bundlers would inline or copy the 2 MB binary for
 * each. They're replaced with a URL no browser can fetch. A pdfstudio
 * upgrade that changes either expression fails the build here.
 */
const WASM_URLS: ReadonlyArray<{ file: RegExp; expression: string }> = [
  {
    file: /\/pdfstudio\/dist\/runner\.js$/,
    expression: "new URL('./wasm/qpdf.wasm', import.meta.url)",
  },
  {
    file: /\/pdfstudio\/dist\/wasm\/qpdf\.js$/,
    expression: 'new URL("qpdf.wasm",import.meta.url)',
  },
];
const UNFETCHABLE = 'new URL("hm-pdf-no-network:/qpdf.wasm")';

export function qpdfWasm(): Plugin {
  return {
    name: "hm-qpdf-wasm",
    enforce: "pre",
    transform(code, id) {
      const target = WASM_URLS.find(({ file }) => file.test(id.split("?")[0] ?? ""));
      if (!target) return undefined;
      if (!code.includes(target.expression)) {
        throw new Error(
          `${id} no longer contains ${target.expression}; update tools/qpdf-wasm-plugin.ts.`,
        );
      }
      return { code: code.replaceAll(target.expression, UNFETCHABLE), map: null };
    },
    resolveId(id) {
      return id === ID ? `\0${ID}` : undefined;
    },
    load(id) {
      if (id !== `\0${ID}`) return undefined;
      const bytes = readQpdfWasm();
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== QPDF_WASM_SHA256) {
        throw new Error(
          `qpdf.wasm has SHA-256 ${hash}, not the reviewed ${QPDF_WASM_SHA256}. If pdfstudio was upgraded on purpose, review the new binary and update QPDF_WASM_SHA256.`,
        );
      }
      return `export default ${JSON.stringify(bytes.toString("base64"))};`;
    },
  };
}
