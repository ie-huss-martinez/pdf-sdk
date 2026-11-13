import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, type Plugin, type Rolldown } from "vite";
import { PACKAGE_VERSION, versionDefine } from "./package-version.js";

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
const SHA256_ID = "virtual:hm-qpdf-wasm-sha256";

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
      return id === ID || id === SHA256_ID ? `\0${id}` : undefined;
    },
    load(id) {
      if (id === `\0${SHA256_ID}`) {
        return `export default ${JSON.stringify(QPDF_WASM_SHA256)};`;
      }
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

const SELF_HOSTED_ENTRY = fileURLToPath(
  new URL("../src/workers/processing-self-hosted.worker.ts", import.meta.url),
);

/**
 * Builds the self-hosted processing worker as one minified ES module, with
 * everything bundled and qpdf.wasm left out: the worker fetches it from its
 * own directory and checks its hash (docs/adr/0007).
 */
export async function buildSelfHostedWorker(version = PACKAGE_VERSION): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [qpdfWasm()],
    define: { ...versionDefine(version), "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      target: "es2022",
      sourcemap: false,
      lib: { entry: SELF_HOSTED_ENTRY, formats: ["es"], fileName: () => "processing.worker.js" },
      // Library mode doesn't minify ES output by itself.
      rolldownOptions: { output: { codeSplitting: false, minify: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
  const chunk = outputs.flatMap((output) => output.output).find((file) => file.type === "chunk");
  if (chunk?.type !== "chunk") {
    throw new Error("The self-hosted processing worker didn't build.");
  }
  return chunk.code;
}

/**
 * Writes the self-hosted processing files next to pdf.js's: the worker and
 * `qpdf.wasm`, after checking its hash (docs/adr/0007).
 */
export function selfHostedProcessing(): Plugin {
  return {
    name: "hm-self-hosted-processing",
    async generateBundle() {
      const wasm = readQpdfWasm();
      const hash = createHash("sha256").update(wasm).digest("hex");
      if (hash !== QPDF_WASM_SHA256) {
        throw new Error(`qpdf.wasm has SHA-256 ${hash}, not the reviewed ${QPDF_WASM_SHA256}.`);
      }
      this.emitFile({
        type: "asset",
        fileName: "assets/processing/processing.worker.js",
        source: await buildSelfHostedWorker(),
      });
      this.emitFile({ type: "asset", fileName: "assets/processing/qpdf.wasm", source: wasm });
    },
  };
}
