import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";
import { PACKAGE_VERSION } from "./package-version.js";
import { selfHostedPdfJsFiles } from "./pdfjs-data-plugin.js";
import { buildSelfHostedWorker, readQpdfWasm } from "./qpdf-wasm-plugin.js";

/** The bundled pdf.js's version, which its worker announces. */
const PDFJS_VERSION = (
  JSON.parse(
    readFileSync(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"), "utf8"),
  ) as { version: string }
).version;

const TYPES: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  wasm: "application/wasm",
};

/**
 * For the browser tests only: serves exactly what the build writes to
 * `dist/assets/`, as static files, so self-hosted mode is tested with the
 * real worker files and no dev-server modules (docs/adr/0007).
 *
 * - `/hm-test-assets/`: the files as built.
 * - `/hm-test-assets-tampered/`: the same, with one byte of `qpdf.wasm`
 *   changed, to test the worker's hash check.
 * - `/hm-test-assets-stale/`: the same, with a processing worker built as
 *   another version of the package, and pdf.js's worker announcing another
 *   pdf.js version, as a host that forgot to copy `dist/assets/` after
 *   upgrading would serve (sdk-core ADR 0038).
 */
export function testAssets(): Plugin {
  const workers = new Map<string, Promise<string>>();
  const files = new Map(selfHostedPdfJsFiles().map(({ path, read }) => [`pdfjs/${path}`, read]));

  async function read(
    path: string,
    variant: string | undefined,
  ): Promise<Uint8Array | string | undefined> {
    const tampered = variant === "-tampered";
    if (path === "processing/processing.worker.js") {
      const version = variant === "-stale" ? "0.0.0-stale" : PACKAGE_VERSION;
      if (!workers.has(version)) workers.set(version, buildSelfHostedWorker(version));
      return workers.get(version);
    }
    if (path === "processing/qpdf.wasm") {
      const wasm = new Uint8Array(readQpdfWasm());
      if (tampered) wasm[wasm.length - 1] = (wasm.at(-1) ?? 0) ^ 0xff;
      return wasm;
    }
    const file = await files.get(path)?.();
    if (variant === "-stale" && path === "pdfjs/build/pdf.worker.min.mjs" && file !== undefined) {
      // pdf.js's worker as another pdf.js version would announce itself.
      const text = typeof file === "string" ? file : new TextDecoder().decode(file);
      return text.replaceAll(`"${PDFJS_VERSION}"`, '"0.0.0-stale"');
    }
    return file;
  }

  return {
    name: "hm-test-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const match = /^\/hm-test-assets(-tampered|-stale)?\/([^?]+)/.exec(request.url ?? "");
        if (!match) return next();
        try {
          const body = await read(match[2] ?? "", match[1]);
          if (body === undefined) {
            response.statusCode = 404;
            response.end();
            return;
          }
          const extension = (match[2] ?? "").split(".").at(-1) ?? "";
          response.setHeader("Content-Type", TYPES[extension] ?? "application/octet-stream");
          response.end(body);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
