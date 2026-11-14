import { resolveAssetsBase } from "@hussmartinez/sdk-core";
import type { PdfEngine } from "../core/ports/pdf-engine.js";
import type { PdfProcessor } from "../core/ports/pdf-processor.js";

/**
 * Checks a provider's `assetsUrl` as soon as it renders. In a browser it's
 * resolved in full, so every mistake fails now. On a server, where a
 * relative URL has no page to resolve against, only what doesn't need one is
 * checked: no query and no fragment, which the resolved files would lose.
 * Nothing resolves it on a server (ADR 0007 in sdk-core).
 */
export function checkAssetsUrl(assetsUrl: string | URL | undefined): void {
  if (assetsUrl === undefined) return;
  if (globalThis.location !== undefined) {
    resolveAssetsBase(assetsUrl);
    return;
  }
  const parsed = new URL(String(assetsUrl), "https://server.invalid/");
  if (parsed.search || parsed.hash) {
    throw new TypeError("assetsUrl can't have a query or a fragment.");
  }
}

/**
 * An engine created on first use, so a provider that renders on a server
 * never creates one, and never resolves its `assetsUrl` there.
 */
export function lazyEngine(create: () => PdfEngine): PdfEngine {
  let engine: PdfEngine | undefined;
  return {
    open: (source, options) => {
      engine ??= create();
      return engine.open(source, options);
    },
    destroy: async () => {
      await engine?.destroy();
    },
  };
}

/** A processor created on first use, for the same reason as {@link lazyEngine}. */
export function lazyProcessor(create: () => PdfProcessor): PdfProcessor {
  let processor: PdfProcessor | undefined;
  return {
    build: (job, options) => {
      processor ??= create();
      return processor.build(job, options);
    },
    destroy: async () => {
      await processor?.destroy();
    },
  };
}
