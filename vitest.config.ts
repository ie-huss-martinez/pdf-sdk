import { playwright } from "@vitest/browser-playwright";
import type { Page, Request } from "playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";
import { pdfJsData } from "./tools/pdfjs-data-plugin.js";
import { qpdfWasm } from "./tools/qpdf-wasm-plugin.js";
import { testAssets } from "./tools/test-assets-plugin.js";

/**
 * Records every request the browser makes, from the page, its frames and its
 * workers, so tests can prove the SDK makes none (ADR 0012, docs/adr/0002).
 * Declared for tests in test/browser-commands.d.ts.
 */
interface RecordedRequest {
  readonly url: string;
  /** Playwright's resource type: "script", "fetch", "xhr", "image" and so on. */
  readonly type: string;
}

const recordings = new WeakMap<
  Page,
  { requests: RecordedRequest[]; listener: (request: Request) => void }
>();

const startRecordingRequests: BrowserCommand<[]> = async (context) => {
  if (context.provider.name !== "playwright") {
    throw new Error("startRecordingRequests needs the Playwright provider");
  }
  const { page } = context;
  const requests: RecordedRequest[] = [];
  const listener = (request: Request) =>
    requests.push({ url: request.url(), type: request.resourceType() });
  page.context().on("request", listener);
  recordings.set(page, { requests, listener });
};

const stopRecordingRequests: BrowserCommand<[], RecordedRequest[]> = async (context) => {
  const recording = recordings.get(context.page);
  if (!recording) {
    throw new Error("stopRecordingRequests was called without startRecordingRequests");
  }
  context.page.context().off("request", recording.listener);
  recordings.delete(context.page);
  return recording.requests;
};

const ALL_BROWSERS = ["chromium", "firefox", "webkit"] as const;

// Browser tests run on Chromium locally, and on all three engines in CI or
// with --mode all-browsers (ADR 0015).
export default defineConfig(({ mode }) => {
  const browsers =
    process.env["CI"] || mode === "all-browsers" ? ALL_BROWSERS : (["chromium"] as const);
  return {
    // Serves pdf.js's data files to the SDK, as in the build (docs/adr/0002).
    plugins: [pdfJsData(), qpdfWasm(), testAssets()],
    // The processing worker inlines qpdf's WebAssembly, as in the build.
    worker: { format: "es", plugins: () => [qpdfWasm()] },
    test: {
      projects: [
        {
          test: {
            name: "unit",
            // build.test.ts checks the built package, so it sits next to the
            // Vite config rather than in src/. test/ holds the repository's
            // own checks, such as the CI image.
            include: ["src/**/*.test.{ts,tsx}", "*.test.ts", "test/**/*.test.ts"],
            exclude: ["**/*.browser.test.{ts,tsx}"],
            environment: "node",
          },
        },
        {
          // Pre-bundled before the tests start. Otherwise Vite discovers pdf.js's
          // worker while a test is running, re-optimises, and reloads the page,
          // which fails the test on a cold cache, as in CI.
          optimizeDeps: {
            include: [
              "pdfjs-dist/build/pdf.min.mjs",
              "pdfjs-dist/build/pdf.worker.min.mjs",
              "@cantoo/pdf-lib",
              "pdfstudio",
            ],
          },
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.{ts,tsx}", "test/**/*.browser.test.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: browsers.map((browser) => ({ browser })),
              commands: { startRecordingRequests, stopRecordingRequests },
            },
          },
        },
      ],
    },
  };
});
