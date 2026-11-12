import type { Plugin } from "vite";
import { selfHostedPdfJsFiles } from "./pdfjs-data-plugin.js";
import { buildSelfHostedWorker, readQpdfWasm } from "./qpdf-wasm-plugin.js";

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
 */
export function testAssets(): Plugin {
  let worker: Promise<string> | undefined;
  const files = new Map(selfHostedPdfJsFiles().map(({ path, read }) => [`pdfjs/${path}`, read]));

  async function read(path: string, tampered: boolean): Promise<Uint8Array | string | undefined> {
    if (path === "processing/processing.worker.js") {
      worker ??= buildSelfHostedWorker();
      return worker;
    }
    if (path === "processing/qpdf.wasm") {
      const wasm = new Uint8Array(readQpdfWasm());
      if (tampered) wasm[wasm.length - 1] = (wasm.at(-1) ?? 0) ^ 0xff;
      return wasm;
    }
    return files.get(path)?.();
  }

  return {
    name: "hm-test-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const match = /^\/hm-test-assets(-tampered)?\/([^?]+)/.exec(request.url ?? "");
        if (!match) return next();
        try {
          const body = await read(match[2] ?? "", Boolean(match[1]));
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
