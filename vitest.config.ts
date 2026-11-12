import { playwright } from "@vitest/browser-playwright";
import type { Page, Request } from "playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

/**
 * Records every request the browser makes, from the page, its frames and its
 * workers, so tests can prove the SDK makes none (ADR 0012, docs/adr/0002).
 * Declared for tests in test/browser-commands.d.ts.
 */
const recordings = new WeakMap<Page, { urls: string[]; listener: (request: Request) => void }>();

const startRecordingRequests: BrowserCommand<[]> = async (context) => {
  if (context.provider.name !== "playwright") {
    throw new Error("startRecordingRequests needs the Playwright provider");
  }
  const { page } = context;
  const urls: string[] = [];
  const listener = (request: Request) => urls.push(request.url());
  page.context().on("request", listener);
  recordings.set(page, { urls, listener });
};

const stopRecordingRequests: BrowserCommand<[], string[]> = async (context) => {
  const recording = recordings.get(context.page);
  if (!recording) {
    throw new Error("stopRecordingRequests was called without startRecordingRequests");
  }
  context.page.context().off("request", recording.listener);
  recordings.delete(context.page);
  return recording.urls;
};

const ALL_BROWSERS = ["chromium", "firefox", "webkit"] as const;

// Browser tests run on Chromium locally, and on all three engines in CI or
// with --mode all-browsers (ADR 0015).
export default defineConfig(({ mode }) => {
  const browsers =
    process.env["CI"] || mode === "all-browsers" ? ALL_BROWSERS : (["chromium"] as const);
  return {
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
