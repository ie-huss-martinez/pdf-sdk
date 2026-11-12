import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/**
 * The pdf.js data files the SDK serves (docs/adr/0002, docs/adr/0006):
 * Adobe's CMaps, the Foxit standard fonts, and the JBIG2 and OpenJPEG
 * decoders. Left out on purpose:
 * - the Liberation fonts, which are GPL-2.0 with a font exception, not
 *   compatible with bundling into an Apache-2.0 package. pdf.js uses system
 *   fonts for Helvetica and Arial instead;
 * - the JavaScript decoder fallbacks and the QuickJS sandbox, which pdf.js
 *   would load with import().
 */
export const PDFJS_DATA = {
  cMapUrl: { directory: "cmaps", files: /\.bcmap$/ },
  standardFontDataUrl: { directory: "standard_fonts", files: /^Foxit\w+\.pfb$/ },
  wasmUrl: { directory: "wasm", files: /^(?:jbig2|openjpeg)\.wasm$/ },
} as const;

/**
 * What the self-hosted copy adds, in pdf.js's own layout, so `assetsUrl` can
 * point at either: the worker, the ICC profile and its decoder, which pdf.js
 * only loads itself, and the licences of everything shipped.
 */
const SELF_HOSTED_EXTRA = [
  { directory: "build", files: /^pdf\.worker\.min\.mjs$/ },
  {
    directory: "wasm",
    files:
      /^(?:qcms_bg\.wasm|LICENSE_(?:JBIG2|OPENJPEG|QCMS|PDFJS_JBIG2|PDFJS_OPENJPEG|PDFJS_QCMS))$/,
  },
  { directory: "iccs", files: /^(?:[\w-]+\.icc|LICENSE)$/ },
  { directory: "cmaps", files: /^LICENSE$/ },
  { directory: "standard_fonts", files: /^LICENSE_FOXIT$/ },
] as const;

const INDEX = "virtual:hm-pdfjs-data";
const FILE = `${INDEX}/`;
// Each file's module ID ends in .js, so plugins that claim IDs by extension,
// such as Vite's WebAssembly helper for .wasm, leave it alone.
const SUFFIX = ".js";
const resolved = (id: string) => `\0${id}`;

function pdfJsRoot(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve("pdfjs-dist/package.json"));
}

function list(root: string, directory: string, files: RegExp): string[] {
  return readdirSync(join(root, directory))
    .filter((name) => files.test(name))
    .sort();
}

/**
 * Serves pdf.js's data files to the SDK without the network (docs/adr/0002):
 *
 * - `virtual:hm-pdfjs-data` exports, per kind of data, a function per file
 *   that imports it as base64 from its own lazy chunk, so a document loads
 *   only the files it needs;
 * - at build time, it also writes `dist/assets/pdfjs/`, for applications that
 *   serve the files from their own origin with `assetsUrl`.
 */
export function pdfJsData(): Plugin {
  const root = pdfJsRoot();
  return {
    name: "hm-pdfjs-data",
    resolveId(id) {
      return id === INDEX || id.startsWith(FILE) ? resolved(id) : undefined;
    },
    load(id) {
      if (id === resolved(INDEX)) {
        const kinds = Object.entries(PDFJS_DATA).map(([kind, { directory, files }]) => {
          const entries = list(root, directory, files).map(
            (name) =>
              `${JSON.stringify(name)}: () => import(${JSON.stringify(`${FILE}${directory}/${name}${SUFFIX}`)}).then((m) => m.default)`,
          );
          return `${JSON.stringify(kind)}: Object.freeze({ __proto__: null, ${entries.join(", ")} })`;
        });
        return `export const pdfJsData = Object.freeze({ __proto__: null, ${kinds.join(", ")} });`;
      }
      if (id.startsWith(resolved(FILE))) {
        const path = id.slice(resolved(FILE).length);
        const [directory, name] = (
          path.endsWith(SUFFIX) ? path.slice(0, -SUFFIX.length) : ""
        ).split("/");
        const allowed = Object.values(PDFJS_DATA).find((data) => data.directory === directory);
        if (!directory || !name || !allowed?.files.test(name)) {
          throw new Error(`${id} isn't one of the pdf.js data files the SDK serves.`);
        }
        const base64 = readFileSync(join(root, directory, name)).toString("base64");
        return `export default ${JSON.stringify(base64)};`;
      }
      return undefined;
    },
    generateBundle() {
      for (const { path, read } of selfHostedPdfJsFiles()) {
        this.emitFile({ type: "asset", fileName: `assets/pdfjs/${path}`, source: read() });
      }
    },
  };
}

/**
 * The files of the self-hosted copy, by their path under `pdfjs/`. The build
 * writes them, and the browser tests serve the same list.
 */
export function selfHostedPdfJsFiles(): { path: string; read: () => Buffer }[] {
  const root = pdfJsRoot();
  return [...Object.values(PDFJS_DATA), ...SELF_HOSTED_EXTRA].flatMap(({ directory, files }) =>
    list(root, directory, files).map((name) => ({
      path: `${directory}/${name}`,
      read: () => readFileSync(join(root, directory, name)),
    })),
  );
}
