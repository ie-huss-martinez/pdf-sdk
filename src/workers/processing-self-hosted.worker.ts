// The processing worker, self-hosted (docs/adr/0007): the build writes it to
// dist/assets/processing/processing.worker.js, next to qpdf.wasm, which it
// fetches from its own directory and checks against the reviewed hash before
// compiling, so a stale or altered copy fails instead of running.
import sha256 from "virtual:hm-qpdf-wasm-sha256";
import { exposeProcessing } from "../adapters/qpdf/expose.js";
import { PdfError } from "../core/errors/pdf-error.js";

async function selfHostedWasm(): Promise<Uint8Array> {
  const url = new URL("qpdf.wasm", self.location.href);
  const response = await fetch(url);
  if (!response.ok) {
    throw new PdfError("WORKER_START_FAILED", `qpdf.wasm couldn't be loaded from ${url}.`, {
      details: { asset: "qpdf.wasm", status: response.status },
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== sha256) {
    throw new PdfError(
      "WORKER_START_FAILED",
      "qpdf.wasm doesn't match this version of the SDK. Copy dist/assets again after upgrading.",
      { details: { asset: "qpdf.wasm", expected: sha256, actual } },
    );
  }
  return bytes;
}

exposeProcessing(selfHostedWasm);
